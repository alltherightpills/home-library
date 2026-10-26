import { createClient } from '@supabase/supabase-js'

// These two values are public by design: the database's per-user rules decide
// what each signed-in person can see. Never put the secret (sb_secret_) key here.
const SUPABASE_URL = 'https://fafbtvvrhopkhnlmekeu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7XO2aj5ml2ER7ikR2hGLsQ_SI8Wz4Zg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
