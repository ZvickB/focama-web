import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createApiServer } from '../server.js'

const SMALL_SAMPLE_CASES = [
  {
    query: 'stroller',
    followUpNotes: 'airport travel and easy folding',
  },
  {
    query: 'coffee grinder',
    followUpNotes: 'quiet for espresso at home',
  },
  {
    query: 'desk lamp',
    followUpNotes: 'small apartment reading light',
  },
]

const CONTEXT_SAMPLE_CASES = [
  {
    query: 'stroller',
    followUpNotes: 'airport travel, easy folding, compact enough for city transit, not too heavy',
  },
  {
    query: 'coffee grinder',
    followUpNotes: 'quiet for espresso at home, consistent grind matters more than cheapest price',
  },
  {
    query: 'desk lamp',
    followUpNotes: 'small apartment reading light, compact footprint, warm light preferred, not flashy',
  },
  {
    query: 'office chair',
    followUpNotes: 'lower back support for long workdays, under $300, not bulky, apartment friendly',
  },
  {
    query: 'running shoes',
    followUpNotes: 'beginner 5k training, knee comfort, daily road running, prefer cushioning over speed',
  },
]

function parseArgs(argv) {
  const args = {
    label: 'current',
    sampleSet: 'small',
    summaryOnly: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--label' && argv[index + 1]) {
      args.label = argv[index + 1]
      index += 1
      continue
    }

    if (value === '--sample-set' && argv[index + 1]) {
      args.sampleSet = argv[index + 1]
      index += 1
      continue
    }

    if (value === '--summary-only' || value === '--quiet') {
      args.summaryOnly = true
    }
  }

  return args
}

function parseServerTimingHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {}
  }

  return Object.fromEntries(
    headerValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [namePart, ...params] = entry.split(';').map((part) => part.trim())
        const durationParam = params.find((part) => part.startsWith('dur='))
        const duration = durationParam ? Number(durationParam.slice(4)) : null

        return [namePart, Number.isFinite(duration) ? duration : null]
      })
      .filter(([, duration]) => Number.isFinite(duration)),
  )
}

function roundNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

async function fetchJson(url, options = {}) {
  const startedAt = performance.now()
  const response = await fetch(url, options)
  const responseReceivedAt = performance.now()
  const rawBody = await response.text()
  const responseParsedAt = performance.now()
  const payload = rawBody ? JSON.parse(rawBody) : {}

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`)
  }

  return {
    payload,
    roundTripMs: roundNumber(responseReceivedAt - startedAt),
    responseReadMs: roundNumber(responseParsedAt - responseReceivedAt),
    totalMs: roundNumber(responseParsedAt - startedAt),
    serverTiming: parseServerTimingHeader(response.headers.get('server-timing') || ''),
  }
}

function buildIpAddress(index) {
  return `203.0.113.${10 + index}`
}

function getSampleCases(sampleSet) {
  return sampleSet === 'context5' ? CONTEXT_SAMPLE_CASES : SMALL_SAMPLE_CASES
}

async function measureCase(baseUrl, sampleCase, index) {
  const discoverUrl = new URL('/api/search/discover', baseUrl)
  discoverUrl.searchParams.set('query', sampleCase.query)
  const discovery = await fetchJson(discoverUrl)

  const refinementUrl = new URL('/api/search/refine', baseUrl)
  refinementUrl.searchParams.set('query', sampleCase.query)
  const refine = await fetchJson(refinementUrl)

  const prewarm = discovery.payload?.discoveryToken && Array.isArray(discovery.payload?.candidatePool?.candidates)
    ? await fetchJson(new URL('/api/search/prewarm', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `192.0.2.${10 + index}`,
        },
        body: JSON.stringify({
          query: sampleCase.query,
          discoveryToken: discovery.payload.discoveryToken,
          candidatePool: discovery.payload.candidatePool,
          requestMode: 'guided_prerank_prewarm',
        }),
      })
    : null

  const finalize = await fetchJson(new URL('/api/search/finalize', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': buildIpAddress(index),
    },
    body: JSON.stringify({
      query: sampleCase.query,
      discoveryToken: discovery.payload.discoveryToken,
      followUpNotes: sampleCase.followUpNotes,
      rejectionFeedback: '',
      retryCount: 0,
      excludedCandidateIds: [],
    }),
  })

  return {
    query: sampleCase.query,
    followUpNotes: sampleCase.followUpNotes,
    discovery: {
      candidateCount: Array.isArray(discovery.payload?.candidatePool?.candidates)
        ? discovery.payload.candidatePool.candidates.length
        : 0,
      discoveryTokenPresent: Boolean(discovery.payload?.discoveryToken),
      roundTripMs: discovery.roundTripMs,
      responseReadMs: discovery.responseReadMs,
      clientTotalMs: discovery.totalMs,
      serverTiming: discovery.serverTiming,
      source: discovery.payload?.source || '',
    },
    refine: {
      prompt: refine.payload?.prompt || '',
      roundTripMs: refine.roundTripMs,
      responseReadMs: refine.responseReadMs,
      clientTotalMs: refine.totalMs,
      serverTiming: refine.serverTiming,
      usage: refine.payload?.usage || null,
    },
    prewarm: prewarm
      ? {
          roundTripMs: prewarm.roundTripMs,
          responseReadMs: prewarm.responseReadMs,
          clientTotalMs: prewarm.totalMs,
          serverTiming: prewarm.serverTiming,
          usage: prewarm.payload?.usage || null,
          prewarm: prewarm.payload?.prewarm || null,
        }
      : null,
    finalize: {
      roundTripMs: finalize.roundTripMs,
      responseReadMs: finalize.responseReadMs,
      clientTotalMs: finalize.totalMs,
      serverTiming: finalize.serverTiming,
      usage: finalize.payload?.usage?.openai || null,
      finalizeFast: finalize.payload?.finalizeFast || null,
      selectedCandidateIds: finalize.payload?.selection?.selectedCandidateIds || [],
      resultTitles: Array.isArray(finalize.payload?.results)
        ? finalize.payload.results.map((result) => result.title)
        : [],
      topResultTitle:
        Array.isArray(finalize.payload?.results) && finalize.payload.results[0]
          ? finalize.payload.results[0].title
          : '',
      shortlistLockServerMs: Number(finalize.payload?.debug?.stageLatencyMs?.total) || null,
      debug: finalize.payload?.debug || null,
    },
  }
}

function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(value))

  if (numericValues.length === 0) {
    return null
  }

  return roundNumber(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
}

function buildSummary(results) {
  return {
    refineAverageLatencyMs: average(results.map((result) => result.refine.roundTripMs)),
    refineAverageTotalTokens: average(
      results.map((result) => Number(result.refine.usage?.totalTokens)),
    ),
    prewarmAverageLatencyMs: average(results.map((result) => Number(result.prewarm?.roundTripMs))),
    prewarmAverageTotalTokens: average(
      results.map((result) => Number(result.prewarm?.usage?.totalTokens)),
    ),
    finalizeAverageLatencyMs: average(results.map((result) => result.finalize.roundTripMs)),
    finalizeAverageOpenAiMs: average(
      results.map((result) => Number(result.finalize.serverTiming?.openai)),
    ),
    finalizeAverageTotalTokens: average(
      results.map((result) => Number(result.finalize.usage?.totalTokens)),
    ),
    fullGuidedAverageTotalTokens: average(
      results.map(
        (result) =>
          Number(result.refine.usage?.totalTokens || 0) +
          Number(result.prewarm?.usage?.totalTokens || 0) +
          Number(result.finalize.usage?.totalTokens || 0),
      ),
    ),
  }
}

function buildConsoleSummary(output, outputPath) {
  const summary = output.summary || {}

  return [
    `Saved full measurement JSON: ${outputPath}`,
    `label: ${output.label}`,
    `sample set: ${output.sampleSet}`,
    `cases: ${output.caseCount}`,
    '',
    `refine avg: ${summary.refineAverageLatencyMs ?? 'n/a'} ms`,
    `prewarm avg: ${summary.prewarmAverageLatencyMs ?? 'n/a'} ms`,
    `finalize avg: ${summary.finalizeAverageLatencyMs ?? 'n/a'} ms`,
    `finalize OpenAI avg: ${summary.finalizeAverageOpenAiMs ?? 'n/a'} ms`,
    `finalize tokens avg: ${summary.finalizeAverageTotalTokens ?? 'n/a'}`,
    `full guided tokens avg: ${summary.fullGuidedAverageTotalTokens ?? 'n/a'}`,
  ].join('\n')
}

async function main() {
  const { label, sampleSet, summaryOnly } = parseArgs(process.argv.slice(2))
  const server = createApiServer()
  const outputDirectory = resolve(process.cwd(), 'temp-data')
  mkdirSync(outputDirectory, { recursive: true })

  await new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise)
  })

  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine measurement server address.')
  }

  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const measuredCases = []

    for (const [index, sampleCase] of getSampleCases(sampleSet).entries()) {
      measuredCases.push(await measureCase(baseUrl, sampleCase, index))
    }

    const output = {
      measuredAt: new Date().toISOString(),
      label,
      sampleSet,
      caseCount: measuredCases.length,
      cases: measuredCases,
      summary: buildSummary(measuredCases),
    }

    const outputPath = resolve(outputDirectory, `guided-finalize-measurement-${label}.json`)
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
    console.log(summaryOnly ? buildConsoleSummary(output, outputPath) : JSON.stringify(output, null, 2))
  } finally {
    await new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) {
          rejectPromise(error)
          return
        }

        resolvePromise()
      })
    })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
