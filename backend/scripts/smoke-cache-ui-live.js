import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.SMOKE_UI_URL || 'https://focamai.com'
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const QUERY = process.env.SMOKE_CACHE_QUERY || 'ergonomic wireless mouse'
const FORCE_REFRESH = process.env.SMOKE_CACHE_UI_FORCE_REFRESH !== 'false'
const MAX_WAIT_MS = Number(process.env.SMOKE_CACHE_UI_TIMEOUT_MS || 180_000)
const MAX_CACHE_RATIO = Number(process.env.SMOKE_CACHE_UI_MAX_RATIO || 0.6)
const MAX_CACHED_SCREEN_MS = Number(process.env.SMOKE_CACHE_UI_MAX_CACHED_MS || 5_000)

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForDevToolsUrl(chrome) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const timeoutId = setTimeout(() => reject(new Error('Chrome did not expose DevTools in time.')), 15_000)

    chrome.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match) return
      clearTimeout(timeoutId)
      resolve(match[1])
    })
    chrome.once('exit', (code) => {
      clearTimeout(timeoutId)
      reject(new Error(`Chrome exited before the smoke started (code ${code}).`))
    })
  })
}

async function waitForPageTarget(devToolsUrl) {
  const endpoint = new URL(devToolsUrl)
  const listUrl = `http://${endpoint.host}/json/list`

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const targets = await fetch(listUrl).then((response) => response.json()).catch(() => [])
    const page = targets.find((target) => target.type === 'page')
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    await wait(100)
  }

  throw new Error('Chrome did not create a page target.')
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  const eventWaiters = new Map()
  let nextId = 0

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
      return
    }

    const waiters = eventWaiters.get(message.method) || []
    eventWaiters.delete(message.method)
    waiters.forEach((resolve) => resolve(message.params))
  })

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  return {
    async send(method, params = {}) {
      await opened
      const id = ++nextId
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
      socket.send(JSON.stringify({ id, method, params }))
      return result
    },
    waitForEvent(method) {
      return new Promise((resolve) => {
        const waiters = eventWaiters.get(method) || []
        waiters.push(resolve)
        eventWaiters.set(method, waiters)
      })
    },
    close() {
      socket.close()
    },
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  })

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }

  return result.result.value
}

function createAttemptExpression({ forceRefresh, query }) {
  return `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const timeoutAt = performance.now() + ${MAX_WAIT_MS};
      const findButton = (label) => Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent.trim().toLowerCase() === label);

      if (!window.__focamaiSmokeOriginalFetch) {
        window.__focamaiSmokeOriginalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const originalUrl = typeof input === 'string' ? input : input.url;
          let requestInput = input;

          if (originalUrl.includes('/api/search/rainforest-discover')) {
            const requestUrl = new URL(originalUrl, window.location.origin);
            if (window.__focamaiSmokeForceRefresh) requestUrl.searchParams.set('cacheMode', 'refresh');
            requestInput = typeof input === 'string' ? requestUrl.toString() : new Request(requestUrl, input);
            const startedAt = performance.now();
            const response = await window.__focamaiSmokeOriginalFetch(requestInput, init);
            const payload = await response.clone().json().catch(() => null);
            window.__focamaiSmokeDiscovery = {
              error: payload?.error || '',
              networkMs: Math.round(performance.now() - startedAt),
              previewCount: payload?.previewResults?.length ?? null,
              requestId: payload?.requestId || '',
              source: payload?.source || '',
              status: response.status,
            };
            return response;
          }

          return window.__focamaiSmokeOriginalFetch(requestInput, init);
        };
      }

      window.__focamaiSmokeForceRefresh = ${forceRefresh};
      window.__focamaiSmokeDiscovery = null;
      const input = document.querySelector('textarea[aria-label="Product topic"]');
      if (!input) throw new Error('Could not find the product query field.');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(50);

      const startButton = findButton('start search');
      if (!startButton) throw new Error('Could not find Start search.');
      const startedAt = performance.now();
      startButton.click();
      let clickedPreview = false;

      while (performance.now() < timeoutAt) {
        const discovery = window.__focamaiSmokeDiscovery;
        if (discovery && discovery.status !== 200) {
          throw new Error('Discovery failed: ' + JSON.stringify(discovery));
        }

        if (!clickedPreview) {
          const previewButton = Array.from(document.querySelectorAll('button'))
            .find((button) => /skip.*show results/.test(button.textContent.toLowerCase()));
          if (previewButton && !previewButton.disabled) {
            previewButton.click();
            clickedPreview = true;
          }
        }

        const firstResult = document.querySelector('[data-result-row-index="0"]');
        if (firstResult) {
          return {
            discovery,
            firstResultText: firstResult.textContent.trim().slice(0, 160),
            queryToScreenMs: Math.round(performance.now() - startedAt),
          };
        }

        await sleep(25);
      }

      const buttonStates = Array.from(document.querySelectorAll('button'))
        .map((button) => ({
          disabled: button.disabled,
          label: button.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80),
        }))
        .filter((button) => button.label)
        .slice(0, 20);
      throw new Error('Timed out waiting for the first visible product row: ' + JSON.stringify({
        buttonStates,
        clickedPreview,
        discovery: window.__focamaiSmokeDiscovery,
        pageText: document.body.textContent.trim().replace(/\\s+/g, ' ').slice(0, 500),
        url: window.location.href,
      }));
    })()
  `
}

async function resetForNextSearch(client) {
  await evaluate(client, `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const timeoutAt = performance.now() + 10_000;
      const newSearchButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent.trim().toLowerCase() === 'new search');
      if (!newSearchButton) throw new Error('Could not find New search.');
      newSearchButton.click();
      while (performance.now() < timeoutAt) {
        if (document.querySelector('textarea[aria-label="Product topic"]')) return true;
        await sleep(25);
      }
      throw new Error('The search form did not reset.');
    })()
  `)
}

const userDataDir = await mkdtemp(join(tmpdir(), 'focamai-cache-ui-'))
const chrome = spawn(CHROME_PATH, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
])

let client

try {
  const devToolsUrl = await waitForDevToolsUrl(chrome)
  const pageTargetUrl = await waitForPageTarget(devToolsUrl)
  client = createCdpClient(pageTargetUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  const loaded = client.waitForEvent('Page.loadEventFired')
  await client.send('Page.navigate', { url: APP_URL })
  await loaded
  await evaluate(client, `
    (async () => {
      const timeoutAt = performance.now() + 20_000;
      while (performance.now() < timeoutAt) {
        if (document.querySelector('textarea[aria-label="Product topic"]')) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('Focamai search form did not load.');
    })()
  `)

  const provider = await evaluate(client, createAttemptExpression({ forceRefresh: FORCE_REFRESH, query: QUERY }))
  await resetForNextSearch(client)
  const cached = await evaluate(client, createAttemptExpression({ forceRefresh: false, query: QUERY }))
  const fasterByMs = provider.queryToScreenMs - cached.queryToScreenMs
  const fasterPercent = Math.round((1 - cached.queryToScreenMs / provider.queryToScreenMs) * 100)
  const result = { provider, cached, fasterByMs, fasterPercent }

  console.log(JSON.stringify(result, null, 2))

  if (FORCE_REFRESH) {
    if (provider.discovery?.source !== 'rainforest_discovery') {
      throw new Error(`Expected Rainforest discovery, received ${provider.discovery?.source || 'unknown source'}.`)
    }
    if (cached.discovery?.source !== 'cache') {
      throw new Error(`Expected cache discovery, received ${cached.discovery?.source || 'unknown source'}.`)
    }
    if (cached.queryToScreenMs > provider.queryToScreenMs * MAX_CACHE_RATIO) {
      throw new Error(`Cache was only ${fasterPercent}% faster; expected at least ${Math.round((1 - MAX_CACHE_RATIO) * 100)}%.`)
    }
  } else {
    if (provider.discovery?.source !== 'cache' || cached.discovery?.source !== 'cache') {
      throw new Error('Cache-only smoke received a non-cache discovery response.')
    }
    if (Math.max(provider.queryToScreenMs, cached.queryToScreenMs) > MAX_CACHED_SCREEN_MS) {
      throw new Error(`Cached results exceeded the ${MAX_CACHED_SCREEN_MS}ms screen-time ceiling.`)
    }
  }
} finally {
  client?.close()
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exitPromise = once(chrome, 'exit')
    chrome.kill('SIGTERM')
    await Promise.race([exitPromise, wait(5_000)])
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const forcedExitPromise = once(chrome, 'exit')
      chrome.kill('SIGKILL')
      await Promise.race([forcedExitPromise, wait(2_000)])
    }
  }
  await rm(userDataDir, { recursive: true, force: true })
}
