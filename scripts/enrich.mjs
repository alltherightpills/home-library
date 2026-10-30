// Looks up each book in Open Library and the Library of Congress, saves every
// answer in the `lookups` table, then fills in blanks: first-published year,
// cover, LC subject headings and call number, and missing page counts.
//
//   npm run enrich -- --try 0375705392   (look up one ISBN and show the result; no sign-in, saves nothing)
//   npm run enrich -- --limit 20         (sign in; process only the first 20 books not yet looked up)
//   npm run enrich                       (sign in; process everything)
//   npm run enrich -- --votes            (sign in; save the category vote's LC and Google answers)
//   npm run enrich -- --votes --limit 20 (the same, for the first 20 books not yet done)
//
// Safe to stop and rerun: books already looked up are skipped, and only empty
// fields are ever filled, so hand edits are never overwritten. (Covers are the one
// exception: a cover from enrichment is upgraded to this edition's own when found.)

import { fetchAll, signIn } from './lib/session.mjs'
import { fetchLoc, pacer, parseMarcXml } from './lib/lookup-tools.mjs'
import { GoogleCapReached, googleCalls, lookUpGoogle, lookUpLocByTitle } from './lib/vote-lookups.mjs'

const fetchOpenLibrary = pacer(1000)

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,edition_count'

// Returns Open Library's work-level record for this ISBN, or null.
async function lookUpOpenLibrary(isbn) {
  const url = `https://openlibrary.org/search.json?q=isbn:${isbn}&fields=${OL_FIELDS}&limit=1`
  return JSON.parse(await fetchOpenLibrary(url)).docs?.[0] ?? null
}

// Returns Open Library's record for this exact edition, or null. Its cover is
// this ISBN's own, unlike the work record's, which can come from any edition.
async function lookUpOpenLibraryEdition(isbn) {
  try {
    return JSON.parse(await fetchOpenLibrary(`https://openlibrary.org/isbn/${isbn}.json`))
  } catch (err) {
    if (err.message === 'HTTP 404') return null
    throw err
  }
}

// Returns the LC catalog's MARC record for this book, or null. LC's catalog
// often indexes only the ISBN-10, so try that first, then the ISBN-13.
async function lookUpLoc(isbn10, isbn13) {
  for (const isbn of [isbn10, isbn13].filter(Boolean)) {
    const url =
      'http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve' +
      `&query=bath.isbn=${isbn}&maximumRecords=1&recordSchema=marcxml`
    const record = parseMarcXml(await fetchLoc(url))
    if (record) return record
  }
  return null
}

// ---------------------------------------------------------------------------
// Deciding what to fill in for one copy
// ---------------------------------------------------------------------------

const SUBJECT_TAGS = ['600', '610', '611', '630', '650', '651', '655']

// The original publication year LC records in 008 for reprints ("r19991985").
function locOriginalYear(lc) {
  const f008 = lc?.control['008'] ?? ''
  if (f008[6] !== 'r') return null
  const year = f008.slice(11, 15)
  return /^\d{4}$/.test(year) ? Number(year) : null
}

// "xxii, 327 p. : ill. ; 24 cm." -> 327
function locPages(lc) {
  const extent = lc?.fields.find((f) => f.tag === '300')?.sub.find(([c]) => c === 'a')?.[1] ?? ''
  const nums = [...extent.matchAll(/(\d+)\s*(?:p\b|pages)/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : null
}

// Candidate first-published years from each source, earliest first.
// A year after this edition's own year can't be right, so it's ignored.
export function firstYearCandidates(copy, ol, lc) {
  const candidates = []
  if (ol?.first_publish_year) candidates.push({ year: ol.first_publish_year, source: 'Open Library' })
  const original = locOriginalYear(lc)
  if (original) candidates.push({ year: original, source: 'LC catalog (008 reprint date)' })
  return candidates
    .filter((c) => !copy.edition_year || c.year <= copy.edition_year)
    .sort((a, b) => a.year - b.year)
}

// The best cover from the lookups: this edition's own, else the work's.
function bestCover(ol, edition) {
  const own = edition?.covers?.find((id) => id > 0)
  if (own) return { cover_id: own, cover_source: 'openlibrary_edition' }
  if (ol?.cover_i) return { cover_id: ol.cover_i, cover_source: 'openlibrary_work' }
  return null
}

// The fields of this copy that the lookups can fill: blanks only, except that
// a cover from enrichment can be upgraded. A cover picked in the app or a photo
// (any source not starting with 'openlibrary_') is never replaced.
export function copyChanges(copy, ol, lc, edition) {
  const changes = {}
  const automatic = !copy.cover_source || copy.cover_source.startsWith('openlibrary_')
  const cover = automatic && bestCover(ol, edition)
  if (cover && (cover.cover_id !== copy.cover_id || cover.cover_source !== copy.cover_source)) {
    Object.assign(changes, cover)
  }
  if (lc) {
    const subjects = lc.fields
      .filter((f) => SUBJECT_TAGS.includes(f.tag))
      .map(({ tag, ind1, ind2, sub }) => ({ tag, ind1, ind2, sub }))
    if (!copy.lc_subjects?.length && subjects.length) changes.lc_subjects = subjects
    const f050 = lc.fields.find((f) => f.tag === '050')
    const callNumber = f050?.sub.filter(([c]) => c === 'a' || c === 'b').map(([, v]) => v).join(' ')
    if (copy.lc_call_number == null && callNumber) changes.lc_call_number = callNumber
    const pages = locPages(lc)
    if (copy.pages == null && pages) changes.pages = pages
  }
  return changes
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? '')
}

if (flag('--try') !== null) {
  // Look up one ISBN and show what would be filled in. No sign-in, saves nothing.
  const isbn = flag('--try').replace(/[^\dX]/gi, '')
  const copy = { isbn13: isbn.length === 13 ? isbn : null, isbn10: isbn.length === 10 ? isbn : null }
  const [ol, lc, edition] = await Promise.all([
    lookUpOpenLibrary(isbn), lookUpLoc(copy.isbn10, copy.isbn13), lookUpOpenLibraryEdition(isbn),
  ])
  console.log('Open Library:', ol ? `${ol.title} (${ol.key})` : 'not found')
  console.log('OL edition:  ', edition ? `${edition.title} (${edition.key})` : 'not found')
  console.log('LC catalog:  ', lc ? lc.fields.find((f) => f.tag === '245')?.sub.map(([, v]) => v).join(' ') : 'not found')
  console.log('First-published candidates:', firstYearCandidates(copy, ol, lc))
  console.log('Would fill:', JSON.stringify(copyChanges(copy, ol, lc, edition), null, 1))
  process.exit(0)
}

const limit = flag('--limit') ? Number(flag('--limit')) : Infinity
await (args.includes('--votes') ? runVotes(limit) : run(limit))

// Saves LC-by-title and Google's best match for every book. Books with no ISBN
// are saved under "copy:<id>". Only `lookups` changes; no book record is touched.
// When Google's daily allowance runs out, LC carries on; rerun tomorrow for the rest.
async function runVotes(limit) {
  const { supabase, libraryId } = await signIn()
  console.log('Signed in. Reading the catalog…')

  const copies = await fetchAll(supabase, 'copies', 'id, work_id, title, isbn13, isbn10', libraryId)
  const authors = await fetchAll(supabase, 'authors', 'id, sort_name, display_name', libraryId)
  const credits = await fetchAll(supabase, 'work_authors', 'work_id, author_id, role, position', libraryId, ['work_id', 'author_id', 'role'])
  const saved = await fetchAll(supabase, 'lookups', 'source, isbn', libraryId, ['source', 'isbn'])
  const have = new Set(saved.map((l) => `${l.source}|${l.isbn}`))

  const authorById = new Map(authors.map((a) => [a.id, a]))
  const mainAuthor = (workId) => {
    const own = credits.filter((c) => c.work_id === workId).sort((a, b) => a.position - b.position)
    return authorById.get((own.find((c) => c.role === 'Author') ?? own[0])?.author_id)
  }

  const books = new Map()
  for (const c of copies) books.set(c.isbn13 ?? c.isbn10 ?? `copy:${c.id}`, c)
  const missing = (key) => ['loc_search', 'google'].filter((source) => !have.has(`${source}|${key}`))
  const todo = [...books].filter(([key]) => missing(key).length)
  const batch = todo.slice(0, limit)
  console.log(`${books.size} books; ${todo.length} still need LC or Google; doing ${batch.length} this run.`)

  const started = Date.now()
  let failures = 0
  let capped = false
  for (const [i, [key, c]] of batch.entries()) {
    const author = mainAuthor(c.work_id)
    const surname = author?.sort_name.split(',')[0].trim()
    const look = {
      loc_search: () => lookUpLocByTitle(c.title, surname),
      google: () => lookUpGoogle({
        title: c.title, author: author?.display_name, surname, isbns: [c.isbn13, c.isbn10].filter(Boolean),
      }),
    }
    const results = []
    for (const source of missing(key)) {
      if (source === 'google' && capped) continue
      try {
        const data = await look[source]()
        const row = { library_id: libraryId, source, isbn: key, found: Boolean(data), data }
        const { error } = await supabase.from('lookups').upsert(row)
        if (error) throw new Error(error.message)
        have.add(`${source}|${key}`)
        results.push(`${source === 'google' ? 'Google' : 'LC'} ${data ? '✓' : '–'}`)
      } catch (err) {
        if (err instanceof GoogleCapReached) {
          capped = true
          console.log(`${err.message}. That's today's allowance; carrying on with LC only.`)
        } else {
          failures++
          results.push(`${source} error (${err.message}; will retry next run)`)
        }
      }
    }
    const done = i + 1
    const minutesLeft = Math.round(((Date.now() - started) / done) * (batch.length - done) / 60000)
    console.log(`[${done}/${batch.length}] ${c.title.slice(0, 50)} — ${results.join(', ')}` +
      (done < batch.length ? `  (~${minutesLeft} min left)` : ''))
  }

  const remaining = (source) => [...books.keys()].filter((key) => !have.has(`${source}|${key}`)).length
  console.log(`\nGoogle calls this run: ${googleCalls}. Still to do: LC ${remaining('loc_search')}, Google ${remaining('google')}.`)
  if (failures) console.log(`${failures} lookups failed this run; run again to retry them.`)
  if (remaining('loc_search') || remaining('google')) console.log('Run the same command again to continue (tomorrow, if Google stopped).')
}

async function run(limit) {
  const { supabase, libraryId } = await signIn()
  console.log('Signed in. Reading the catalog…')

  const copies = await fetchAll(
    supabase, 'copies',
    'id, work_id, title, isbn13, isbn10, edition_year, pages, cover_id, cover_source, lc_call_number, lc_subjects',
    libraryId,
  )
  const works = await fetchAll(supabase, 'works', 'id, first_published_year', libraryId)
  const saved = await fetchAll(supabase, 'lookups', 'isbn, source, found, data', libraryId, ['source', 'isbn'])
  const lookups = new Map(saved.map((l) => [`${l.source}|${l.isbn}`, l]))

  // --- Phase 1: look up every ISBN not already looked up --------------------
  const SOURCES = ['openlibrary', 'openlibrary_edition', 'loc']
  const LABELS = { openlibrary: 'OL', openlibrary_edition: 'OL edition', loc: 'LC' }
  const keyOf = (c) => c.isbn13 ?? c.isbn10
  const todo = []
  const seen = new Set()
  for (const c of copies) {
    const key = keyOf(c)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (SOURCES.some((source) => !lookups.has(`${source}|${key}`))) todo.push(c)
  }
  const batch = todo.slice(0, limit)
  console.log(`${seen.size} distinct ISBNs; ${todo.length} still to look up` +
    (batch.length < todo.length ? `; doing ${batch.length} this run.` : '.'))

  const started = Date.now()
  let failures = 0
  for (const [i, c] of batch.entries()) {
    const key = keyOf(c)
    const jobs = []
    if (!lookups.has(`openlibrary|${key}`)) jobs.push(['openlibrary', () => lookUpOpenLibrary(key)])
    if (!lookups.has(`openlibrary_edition|${key}`)) jobs.push(['openlibrary_edition', () => lookUpOpenLibraryEdition(key)])
    if (!lookups.has(`loc|${key}`)) jobs.push(['loc', () => lookUpLoc(c.isbn10, c.isbn13)])

    const results = await Promise.all(
      jobs.map(async ([source, look]) => {
        try {
          const data = await look()
          const row = { library_id: libraryId, source, isbn: key, found: Boolean(data), data }
          const { error } = await supabase.from('lookups').upsert(row)
          if (error) throw new Error(error.message)
          lookups.set(`${source}|${key}`, row)
          return `${LABELS[source]} ${data ? '✓' : '–'}`
        } catch (err) {
          failures++
          return `${LABELS[source]} error (${err.message}; will retry next run)`
        }
      }),
    )

    const done = i + 1
    const minutesLeft = Math.round(((Date.now() - started) / done) * (batch.length - done) / 60000)
    console.log(`[${done}/${batch.length}] ${c.title.slice(0, 50)} — ${results.join(', ')}` +
      (done < batch.length ? `  (~${minutesLeft} min left)` : ''))
  }

  // --- Phase 2: fill in blanks from everything looked up so far --------------
  console.log('\nFilling in blanks…')
  const found = (source, c) => {
    const l = lookups.get(`${source}|${keyOf(c)}`)
    return l?.found ? l.data : null
  }
  const stats = { covers: 0, edition_covers: 0, relabeled: 0, lc_subjects: 0, lc_call_number: 0, pages: 0, first_published_year: 0 }

  for (const c of copies) {
    if (!keyOf(c)) continue
    const changes = copyChanges(c, found('openlibrary', c), found('loc', c), found('openlibrary_edition', c))
    if (!Object.keys(changes).length) continue
    const { error } = await supabase.from('copies').update(changes).eq('id', c.id)
    if (error) throw new Error(`copies: ${error.message}`)
    if (changes.cover_id && changes.cover_id !== c.cover_id) {
      stats.covers++
      if (changes.cover_source === 'openlibrary_edition') stats.edition_covers++
    }
    if (changes.cover_source && changes.cover_id === c.cover_id) stats.relabeled++
    for (const k of ['lc_subjects', 'lc_call_number', 'pages']) if (changes[k]) stats[k]++
  }

  // A work's first-published year is the earliest any of its copies suggests.
  for (const w of works) {
    if (w.first_published_year != null) continue
    const best = copies
      .filter((c) => c.work_id === w.id && keyOf(c))
      .flatMap((c) => firstYearCandidates(c, found('openlibrary', c), found('loc', c)))
      .sort((a, b) => a.year - b.year)[0]
    if (!best) continue
    const { error } = await supabase
      .from('works')
      .update({ first_published_year: best.year, first_published_source: best.source })
      .eq('id', w.id)
    if (error) throw new Error(`works: ${error.message}`)
    stats.first_published_year++
  }

  // --- Report ------------------------------------------------------------------
  const count = (source) => [...seen].filter((k) => lookups.get(`${source}|${k}`)?.found).length
  const lookedUp = (source) => [...seen].filter((k) => lookups.has(`${source}|${k}`)).length
  console.log(`
Looked up so far:  Open Library found ${count('openlibrary')} of ${lookedUp('openlibrary')}, its edition records ${count('openlibrary_edition')} of ${lookedUp('openlibrary_edition')}, LC found ${count('loc')} of ${lookedUp('loc')}
Filled in this run:
  first-published year  ${stats.first_published_year} works
  cover (new or better) ${stats.covers} books (${stats.edition_covers} of them this edition's own)
  cover source label    ${stats.relabeled} books (same cover, source corrected)
  LC subject headings   ${stats.lc_subjects} books
  LC call number        ${stats.lc_call_number} books
  page count            ${stats.pages} books
Books with no ISBN (not looked up): ${copies.filter((c) => !keyOf(c)).length}`)
  if (failures) console.log(`${failures} lookups failed this run; run again to retry them.`)
  if (todo.length > batch.length) console.log(`${todo.length - batch.length} books still to look up; run again to continue.`)
}
