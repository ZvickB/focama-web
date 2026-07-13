import { normalizeRankingPreference, RANKING_PREFERENCES } from '../../../shared/ranking-preference.js'

const TABLE_NAME = 'user_preferences'

export async function loadRemoteRankingPreference({ client, userId }) {
  if (!client || !userId) {
    return RANKING_PREFERENCES.BALANCED
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select('ranking_priority')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return normalizeRankingPreference(data?.ranking_priority)
}

export async function saveRemoteRankingPreference({ client, userId, rankingPreference }) {
  if (!client || !userId) {
    return RANKING_PREFERENCES.BALANCED
  }

  const nextPreference = normalizeRankingPreference(rankingPreference)
  const { data, error } = await client
    .from(TABLE_NAME)
    .upsert({
      user_id: userId,
      ranking_priority: nextPreference,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('ranking_priority')
    .single()

  if (error) throw error
  return normalizeRankingPreference(data?.ranking_priority)
}
