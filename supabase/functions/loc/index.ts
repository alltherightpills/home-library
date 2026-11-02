// The LC relay: the app asks here, and this asks the Library of Congress catalog.
// LC's SRU server is http-only and doesn't allow other websites to read its
// answers, so the app can't ask it directly from the phone.
//
// It takes only a search ({ query: 'bath.isbn=0375705392', max: 1 }) and builds
// the LC address itself, so it can't be used to fetch anything else. It answers
// signed-in people only: Supabase checks the sign-in before this code runs, and
// the role check below turns away the public key on its own.
//
// Deploy: supabase functions deploy loc --project-ref fafbtvvrhopkhnlmekeu --use-api

const LC = 'http://lx2.loc.gov:210/lcdb'
const USER_AGENT = 'HomeLibrary/0.1 (personal catalog; github.com/alltherightpills/home-library)'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// The sign-in's role, read from the token Supabase has already checked.
function roleOf(req: Request): string | null {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })
  if (roleOf(req) !== 'authenticated') return reply(401, { error: 'Sign in first.' })

  let query: unknown, max: unknown
  try {
    ;({ query, max } = await req.json())
  } catch {
    return reply(400, { error: 'Send { query, max } as JSON.' })
  }
  if (typeof query !== 'string' || !query.trim() || query.length > 300) {
    return reply(400, { error: 'query must be an LC search of up to 300 characters.' })
  }
  const count = Number.isInteger(max) && (max as number) >= 1 && (max as number) <= 10 ? max : 1

  const url = `${LC}?version=1.1&operation=searchRetrieve&query=${encodeURIComponent(query)}` +
    `&maximumRecords=${count}&recordSchema=marcxml`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return reply(502, { error: `LC answered HTTP ${res.status}` })
    return new Response(await res.text(), { headers: { ...CORS, 'Content-Type': 'application/xml' } })
  } catch (err) {
    return reply(502, { error: `LC couldn't be reached: ${(err as Error).message}` })
  }
})
