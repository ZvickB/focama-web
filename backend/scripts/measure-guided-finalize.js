import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createApiServer } from '../server.js'

const SAMPLE_CASES = [
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

function parseArgs(argv) {
  const args = {
    label: 'current',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--label' && argv[index + 1]) {
      args.label = argv[index + 1]
      index += 1
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
  const completedAt = performance.now()
  const rawBody = await response.text()
  const payload = rawBody ? JSON.parse(rawBody) : {}

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`)
  }

  return {
    payload,
    roundTripMs: roundNumber(completedAt - startedAt),
    serverTiming: parseServerTimingHeader(response.headers.get('server-timing') || ''),
  }
}

function buildIpAddress(index) {
  return `203.0.113.${10 + index}`
}

async function measureCase(baseUrl, sampleCase, index) {
  const discoverUrl = new URL('/api/search/discover', baseUrl)
  discoverUrl.searchParams.set('query', sampleCase.query)
  const discovery = await fetchJson(discoverUrl)

  const refinementUrl = new URL('/api/search/refine', baseUrl)
  refinementUrl.searchParams.set('query', sampleCase.query)
  const refine = await fetchJson(refinementUrl)

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
      serverTiming: discovery.serverTiming,
      source: discovery.payload?.source || '',
    },
    refine: {
      prompt: refine.payload?.prompt || '',
      roundTripMs: refine.roundTripMs,
      serverTiming: refine.serverTiming,
      usage: refine.payload?.usage || null,
    },
    finalize: {
      roundTripMs: finalize.roundTripMs,
      serverTiming: finalize.serverTiming,
      usage: finalize.payload?.usage?.openai || null,
      selectedCandidateIds: finalize.payload?.selection?.selectedCandidateIds || [],
      resultTitles: Array.isArray(finalize.payload?.results)
        ? finalize.payload.results.map((result) => result.title)
        : [],
      badgeLabels: Array.isArray(finalize.payload?.results)
        ? finalize.payload.results.map((result) => result.badgeLabel || '')
        : [],
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
          Number(result.finalize.usage?.totalTokens || 0),
      ),
    ),
  }
}

async function main() {
  const { label } = parseArgs(process.argv.slice(2))
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

    for (const [index, sampleCase] of SAMPLE_CASES.entries()) {
      measuredCases.push(await measureCase(baseUrl, sampleCase, index))
    }

    const output = {
      measuredAt: new Date().toISOString(),
      label,
      cases: measuredCases,
      summary: buildSummary(measuredCases),
    }

    const outputPath = resolve(outputDirectory, `guided-finalize-measurement-${label}.json`)
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
    console.log(JSON.stringify(output, null, 2))
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
