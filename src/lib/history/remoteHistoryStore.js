import { createHistoryEntry } from '@/lib/history/historyEntry.js'

function mapRowToEntry(row) {
  return createHistoryEntry({
    amazonDomain: row.amazon_domain || '',
    createdAt: row.created_at,
    followUp: row.follow_up || '',
    id: row.id,
    query: row.query,
    results: Array.isArray(row.results) ? row.results : [],
    updatedAt: row.updated_at,
  })
}

function mapEntryToRow(entry, userId) {
  return {
    user_id: userId,
    query_key: entry.queryKey,
    query: entry.query,
    follow_up: entry.followUp,
    amazon_domain: entry.amazonDomain,
    results: entry.results,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }
}

export function createRemoteHistoryStore({ client, userId }) {
  return {
    async list() {
      const { data, error } = await client
        .from('saved_searches')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data || []).map(mapRowToEntry)
    },

    async save(entryInput) {
      const entry = createHistoryEntry({
        ...entryInput,
        updatedAt: new Date().toISOString(),
      })
      const { data, error } = await client
        .from('saved_searches')
        .upsert(mapEntryToRow(entry, userId), { onConflict: 'user_id,query_key' })
        .select('*')
        .single()

      if (error) throw error
      return mapRowToEntry(data)
    },

    async remove(id) {
      const { error } = await client
        .from('saved_searches')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)

      if (error) throw error
    },

    async clear() {
      const { error } = await client
        .from('saved_searches')
        .delete()
        .eq('user_id', userId)

      if (error) throw error
    },
  }
}
