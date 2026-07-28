import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkAmazonPricesByAsin } from '../lib/price-watch/price-check-provider.js'
import {
  createResendPriceDropSender,
  getPriceWatchEmailConfig,
} from '../lib/price-watch/price-drop-email.js'
import { getEnv } from '../lib/search-data.js'
import { getSupabaseAdminClient } from '../lib/storage/supabase-client.js'

const PRICE_WATCHES_TABLE = 'price_watches'
const DEFAULT_BATCH_SIZE = 20

function normalizeText(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizePositiveNumber(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function mapWatchRow(row = {}) {
  return {
    amazonDomain: normalizeText(row.amazon_domain, 80) || 'amazon.com',
    asin: normalizeText(row.asin, 200),
    baselinePrice: normalizePositiveNumber(row.baseline_price),
    currency: normalizeText(row.currency, 12),
    id: normalizeText(row.id, 120),
    imageUrl: normalizeText(row.image_url, 1000),
    productUrl: normalizeText(row.product_url, 1000),
    paused: Boolean(row.paused),
    productTitle: normalizeText(row.product_title, 300),
    targetPrice: normalizePositiveNumber(row.target_price),
    thresholdPct: normalizePositiveNumber(row.threshold_pct) || 5,
    userId: normalizeText(row.user_id, 120),
  }
}

function isEnabledFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function chunkArray(values, size) {
  const chunkSize = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : DEFAULT_BATCH_SIZE
  const chunks = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

export function computePriceWatchEligibility(watch, priceCheck) {
  const freshPrice = normalizePositiveNumber(priceCheck?.currentPrice)

  if (!freshPrice) {
    return {
      dropPct: 0,
      eligible: false,
      meetsPct: false,
      meetsTarget: false,
      reason: priceCheck?.unavailableReason || 'missing_price',
    }
  }

  if (!watch?.baselinePrice) {
    return {
      dropPct: 0,
      eligible: false,
      freshPrice,
      meetsPct: false,
      meetsTarget: false,
      reason: 'missing_baseline',
    }
  }

  const dropPct = ((watch.baselinePrice - freshPrice) / watch.baselinePrice) * 100
  const meetsPct = dropPct >= watch.thresholdPct
  const meetsTarget = watch.targetPrice !== null && freshPrice <= watch.targetPrice

  return {
    dropPct,
    eligible: meetsPct || meetsTarget,
    freshPrice,
    meetsPct,
    meetsTarget,
    reason: meetsPct || meetsTarget ? 'would_notify' : 'no_threshold_crossed',
  }
}

export function groupActiveWatchesByDomain(rows = []) {
  const grouped = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const watch = mapWatchRow(row)

    if (!watch.id || !watch.asin || watch.paused) {
      continue
    }

    if (!grouped.has(watch.amazonDomain)) {
      grouped.set(watch.amazonDomain, [])
    }

    grouped.get(watch.amazonDomain).push(watch)
  }

  return grouped
}

async function readActiveWatches(supabase) {
  const { data, error } = await supabase
    .from(PRICE_WATCHES_TABLE)
    .select('*')
    .eq('paused', false)
    .order('created_at', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

async function updateWatchCheckResult(supabase, watch, priceCheck, checkedAt) {
  const freshPrice = normalizePositiveNumber(priceCheck?.currentPrice)
  const patch = {
    last_checked_at: checkedAt,
    updated_at: checkedAt,
  }

  if (freshPrice) {
    patch.last_seen_price = freshPrice
  }

  const { error } = await supabase
    .from(PRICE_WATCHES_TABLE)
    .update(patch)
    .eq('id', watch.id)

  if (error) throw error
}

async function markWatchNotified(supabase, watch, freshPrice, checkedAt) {
  const { error } = await supabase
    .from(PRICE_WATCHES_TABLE)
    .update({
      baseline_price: freshPrice,
      last_notified_at: checkedAt,
      last_notified_price: freshPrice,
      updated_at: checkedAt,
    })
    .eq('id', watch.id)

  if (error) throw error
}

async function getUserEmailById(supabase, userId) {
  const normalizedUserId = normalizeText(userId, 120)
  if (!normalizedUserId || !supabase?.auth?.admin?.getUserById) {
    return ''
  }

  const { data, error } = await supabase.auth.admin.getUserById(normalizedUserId)
  if (error) throw error

  return normalizeText(data?.user?.email, 320)
}

function summarizeWouldNotify(watch, priceCheck, eligibility) {
  return {
    amazonDomain: watch.amazonDomain,
    asin: watch.asin,
    baselinePrice: watch.baselinePrice,
    currentPrice: eligibility.freshPrice,
    dropPct: Number(eligibility.dropPct.toFixed(2)),
    id: watch.id,
    imageUrl: watch.imageUrl,
    meetsPct: eligibility.meetsPct,
    meetsTarget: eligibility.meetsTarget,
    productTitle: watch.productTitle,
    productUrl: watch.productUrl,
    targetPrice: watch.targetPrice,
    thresholdPct: watch.thresholdPct,
    userId: watch.userId,
    source: priceCheck?.source || 'unknown',
  }
}

export async function runPriceWatchCheck({
  batchSize = DEFAULT_BATCH_SIZE,
  checkedAt = new Date().toISOString(),
  emailEnabled = isEnabledFlag(getEnv('PRICE_WATCH_EMAILS_ENABLED')),
  emailConfig = getPriceWatchEmailConfig(),
  emailSender = createResendPriceDropSender,
  getUserEmail = getUserEmailById,
  logger = console,
  priceChecker = checkAmazonPricesByAsin,
  rainforestApiKey = getEnv('RAINFOREST_API_KEY'),
  supabase = getSupabaseAdminClient(),
} = {}) {
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.')
  }

  const rows = await readActiveWatches(supabase)
  const watchesByDomain = groupActiveWatchesByDomain(rows)
  const summary = {
    checkedAt,
    checkedWatches: 0,
    emailEnabled,
    emailsFailed: 0,
    emailsSent: 0,
    skippedWatches: 0,
    wouldNotify: [],
  }
  const sendPriceDropEmail = emailEnabled ? emailSender() : null

  for (const [amazonDomain, watches] of watchesByDomain.entries()) {
    const uniqueAsins = Array.from(new Set(watches.map((watch) => watch.asin)))
    const priceResults = new Map()

    for (const asinBatch of chunkArray(uniqueAsins, batchSize)) {
      const batchResults = await priceChecker({
        amazonDomain,
        asins: asinBatch,
        checkedAt,
        rainforestApiKey,
      })

      for (const [asin, result] of batchResults.entries()) {
        priceResults.set(asin, result)
      }
    }

    for (const watch of watches) {
      const priceCheck = priceResults.get(watch.asin) || {
        amazonDomain,
        asin: watch.asin,
        checkedAt,
        currentPrice: null,
        source: 'rainforest',
        unavailableReason: 'missing_price',
      }
      const eligibility = computePriceWatchEligibility(watch, priceCheck)

      await updateWatchCheckResult(supabase, watch, priceCheck, checkedAt)
      summary.checkedWatches += 1

      if (eligibility.eligible) {
        const notification = summarizeWouldNotify(watch, priceCheck, eligibility)
        summary.wouldNotify.push(notification)

        if (!emailEnabled) {
          logger.info('[price-watch] dry-run would notify', notification)
          continue
        }

        try {
          const to = await getUserEmail(supabase, watch.userId)

          if (!to) {
            throw new Error('No email address found for watched product owner.')
          }

          await sendPriceDropEmail({
            currency: priceCheck?.currency || watch.currency || (amazonDomain === 'amazon.ca' ? 'CAD' : 'USD'),
            from: emailConfig.from,
            manageUrl: emailConfig.manageUrl,
            newPrice: eligibility.freshPrice,
            oldPrice: watch.baselinePrice,
            imageUrl: watch.imageUrl,
            productTitle: watch.productTitle || watch.asin,
            productUrl: priceCheck?.productUrl || watch.productUrl,
            to,
          })
          await markWatchNotified(supabase, watch, eligibility.freshPrice, checkedAt)
          summary.emailsSent += 1
          logger.info('[price-watch] email sent', {
            asin: watch.asin,
            id: watch.id,
            userId: watch.userId,
          })
        } catch (error) {
          summary.emailsFailed += 1
          logger.error('[price-watch] email failed', {
            asin: watch.asin,
            error: error instanceof Error ? error.message : 'Unknown error',
            id: watch.id,
            userId: watch.userId,
          })
        }
      } else {
        summary.skippedWatches += 1
        logger.info('[price-watch] dry-run skipped', {
          amazonDomain: watch.amazonDomain,
          asin: watch.asin,
          id: watch.id,
          reason: eligibility.reason,
        })
      }
    }
  }

  logger.info('[price-watch] dry-run complete', {
    checkedAt: summary.checkedAt,
    checkedWatches: summary.checkedWatches,
    emailEnabled: summary.emailEnabled,
    emailsFailed: summary.emailsFailed,
    emailsSent: summary.emailsSent,
    skippedWatches: summary.skippedWatches,
    wouldNotifyCount: summary.wouldNotify.length,
  })

  return summary
}

export async function runPriceWatchDryRun(options = {}) {
  return runPriceWatchCheck({
    ...options,
    emailEnabled: false,
  })
}

async function main() {
  try {
    await runPriceWatchCheck()
  } catch (error) {
    console.error('[price-watch] dry-run failed', error)
    process.exitCode = 1
  }
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : ''

if (invokedFile && currentFile === invokedFile) {
  void main()
}
