import { createClient } from '@supabase/supabase-js'

// These two values are public by design: the database's per-user rules decide
// what each signed-in person can see. Never put the secret (sb_secret_) key here.
const SUPABASE_URL = 'https://fafbtvvrhopkhnlmekeu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7XO2aj5ml2ER7ikR2hGLsQ_SI8Wz4Zg'

// A request that can't reach the database (no signal) fails with a plain
// message instead of Safari's "Load failed". The database library shows it as
// "<name>: <message>", so a failed save reads "Saving: No connection: …".
async function fetchSayingNoConnection(...args) {
  try {
    return await fetch(...args)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    const plain = new Error('couldn’t reach the database. Check your signal and try again.')
    plain.name = 'No connection'
    throw plain
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { fetch: fetchSayingNoConnection } })
