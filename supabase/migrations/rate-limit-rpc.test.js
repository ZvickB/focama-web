import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const REPAIR_MIGRATION_URL = new URL(
  './20260827225123_repair_atomic_rate_limit_timestamp.sql',
  import.meta.url,
)

describe('atomic rate-limit RPC migration', () => {
  it('inserts an unambiguous timestamptz variable instead of PostgreSQL CURRENT_TIME', async () => {
    const migration = await readFile(REPAIR_MIGRATION_URL, 'utf8')
    const functionBody = migration.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] || ''

    expect(functionBody).toContain('v_now timestamptz := now();')
    expect(functionBody).toContain('values (v_now, p_rate_key, p_request_id);')
    expect(functionBody).not.toMatch(/\bcurrent_time\b/i)
  })
})
