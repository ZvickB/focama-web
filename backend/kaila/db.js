import { createClient } from '@supabase/supabase-js'
import { kailaConfig } from './config.js'

const supabase = createClient(kailaConfig.supabaseUrl, kailaConfig.supabaseServiceRoleKey)

export function db() {
  return supabase.schema(kailaConfig.supabaseDbSchema)
}
