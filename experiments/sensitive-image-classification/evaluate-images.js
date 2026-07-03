import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'

import { analyzeSensitiveImageBuffer } from '../../backend/lib/sensitive-image-analysis.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const DEFAULT_INPUT_PATH = 'experiments/sensitive-image-classification/sample-input.json'
const DEFAULT_OUTPUT_PATH = 'temp-data/sensitive-image-evaluation/latest.json'

function parseArguments(argv) {
  const options = { inputPath: DEFAULT_INPUT_PATH, outputPath: DEFAULT_OUTPUT_PATH }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.inputPath = argv[index + 1] || options.inputPath
    if (argv[index] === '--output') options.outputPath = argv[index + 1] || options.outputPath
  }
  return options
}

async function readImageBuffer(entry) {
  if (entry.imagePath) {
    const imagePath = isAbsolute(entry.imagePath) ? entry.imagePath : resolve(process.cwd(), entry.imagePath)
    const buffer = await readFile(imagePath)
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image_exceeds_8mb_limit')
    return buffer
  }

  if (!/^https:\/\//i.test(entry.imageUrl || '')) throw new Error('https_image_url_or_image_path_required')
  const response = await fetch(entry.imageUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`image_fetch_failed_${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error('response_is_not_an_image')
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw new Error('image_exceeds_8mb_limit')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image_exceeds_8mb_limit')
  return buffer
}

function summarize(results) {
  const completed = results.filter((entry) => !entry.error)
  const labeled = completed.filter((entry) => entry.expectedOutcome === 'show' || entry.expectedOutcome === 'hide')
  return {
    total: results.length,
    completed: completed.length,
    errors: results.length - completed.length,
    proposedShow: completed.filter((entry) => entry.proposedOutcome === 'show').length,
    proposedHide: completed.filter((entry) => entry.proposedOutcome === 'hide').length,
    labeled: labeled.length,
    labeledCorrect: labeled.filter((entry) => entry.expectedOutcome === entry.proposedOutcome).length,
    dangerousFalseReveals: labeled.filter(
      (entry) => entry.expectedOutcome === 'hide' && entry.proposedOutcome === 'show',
    ).length,
  }
}

async function main() {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2))
  const input = JSON.parse(await readFile(resolve(process.cwd(), inputPath), 'utf8'))
  if (!Array.isArray(input)) throw new Error('Input must be a JSON array.')

  console.log('Loading shared human-detection models...')

  const results = []
  for (const [index, entry] of input.entries()) {
    const label = entry.id || entry.title || `image-${index + 1}`
    console.log(`[${index + 1}/${input.length}] ${label}`)
    try {
      const analysis = await analyzeSensitiveImageBuffer(await readImageBuffer(entry))
      results.push({
        id: entry.id || '',
        title: entry.title || '',
        imageUrl: entry.imageUrl || '',
        imagePath: entry.imagePath || '',
        expectedOutcome: entry.expectedOutcome || '',
        ...analysis,
      })
    } catch (error) {
      results.push({
        id: entry.id || '',
        title: entry.title || '',
        imageUrl: entry.imageUrl || '',
        imagePath: entry.imagePath || '',
        expectedOutcome: entry.expectedOutcome || '',
        proposedOutcome: 'hide',
        reasons: ['analysis_failed'],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'offline_shadow_evaluation_only',
    summary: summarize(results),
    results,
  }
  const absoluteOutputPath = resolve(process.cwd(), outputPath)
  await mkdir(dirname(absoluteOutputPath), { recursive: true })
  await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Report written to ${absoluteOutputPath}`)
  console.log(report.summary)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
