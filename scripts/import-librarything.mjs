// Imports a LibraryThing JSON export into the Home Library database.
//
//   npm run import:lt -- data/librarything_export.json --dry-run   (report only, uploads nothing)
//   npm run import:lt -- data/librarything_export.json             (signs in and uploads)
//
// Safe to run more than once: books, works, and authors already in the
// database are skipped, never duplicated or overwritten.

import { readFileSync } from 'node:fs'
import { fetchAll, signIn } from './lib/session.mjs'

// LibraryThing formats that are mistakes in this physical-only catalog.
const WRONG_FORMATS = {
  Ebook: 'Listed as an e-book in LibraryThing; edition details may be for the digital version.',
  'Digital audiobook':
    'Listed as an audiobook in LibraryThing; edition details may be for the digital version.',
  Other: 'Listed as "Other" format in LibraryThing; check edition details.',
}

// ---------------------------------------------------------------------------
// Turning one LibraryThing record into database rows
// ---------------------------------------------------------------------------

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const list = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])

function toInt(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

// "vii; 219" -> 219: the largest arabic number is the main page count.
// Falls back to "..., 1162 pages" in the publication line.
function parsePages(pages, publication) {
  const nums = (text(pages) ?? '').match(/\d+/g)
  if (nums) return Math.max(...nums.map(Number))
  return toInt((text(publication) ?? '').match(/(\d+) pages/)?.[1])
}

// "Pantheon (1999), Edition: 34874th, 352 pages" -> "Pantheon"
// "New York : Perennial Classics, 1999."          -> "Perennial Classics"
function parsePublisher(v) {
  let p = text(v)
  if (!p) return null
  if (p.includes(' : ')) p = p.split(' : ').slice(1).join(' : ')
  return text(p.split(/\s*\(|,/)[0])
}

// Some records borrowed from European libraries name roles in other languages.
const ROLE_NAMES = { Auteur: 'Author', Autor: 'Author', Herausgeber: 'Editor', Artiste: 'Artist' }

function parseIsbns(b) {
  const all = [...list(b.isbn), b.originalisbn].map((x) => String(x ?? '').replace(/[^\dXx]/g, ''))
  return {
    isbn13: all.find((x) => x.length === 13) ?? null,
    isbn10: all.find((x) => x.length === 10)?.toUpperCase() ?? null,
  }
}

// Work title: drop the subtitle and any trailing "(Series name)".
// A starting point only; enrichment and hand edits can improve it.
function workTitle(title) {
  return title.replace(/\s*\([^)]*\)\s*$/, '').split(/:\s/)[0].trim() || title
}

function convert(b) {
  const formats = list(b.format).map((f) => f.text)
  const wrong = formats.find((f) => WRONG_FORMATS[f])
  const binding = formats.find((f) => f === 'Paperback' || f === 'Hardcover') ?? null
  const year = text(b.date)

  return {
    workKey: text(b.workcode) ?? `book-${b.books_id}`,
    work: {
      title: workTitle(b.title),
      original_language: list(b.originallanguage)[0] ?? null,
      lt_workcode: text(b.workcode),
    },
    authors: list(b.authors)
      .filter((a) => text(a.lf) || text(a.fl))
      .map((a, i) => ({
        sort_name: text(a.lf) ?? text(a.fl),
        display_name: text(a.fl) ?? text(a.lf),
        role: ROLE_NAMES[text(a.role)] ?? text(a.role) ?? 'Author',
        position: i,
      })),
    copy: {
      title: b.title.trim(),
      ...parseIsbns(b),
      publisher: parsePublisher(b.publication),
      edition_year: year && /^\d{4}$/.test(year) ? toInt(year) : null,
      pages: parsePages(b.pages, b.publication),
      binding,
      languages: list(b.language),
      lcc: text(b.lcc?.code),
      dewey: list(b.ddc?.code)[0] ?? null,
      dewey_wording: list(b.ddc?.wording),
      subjects: list(b.subject).map(list),
      lt_genres: list(b.genre),
      needs_review: Boolean(wrong),
      review_note: wrong ? WRONG_FORMATS[wrong] : null,
      lt_book_id: String(b.books_id),
      lt_record: b,
      added_on: text(b.entrydate) ?? undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// Building the full set of rows, with works and authors de-duplicated
// ---------------------------------------------------------------------------

function build(records) {
  const works = new Map() // workKey -> work
  const authors = new Map() // sort_name -> author
  const links = new Map() // "workKey|sort_name|role" -> link
  const copies = []

  for (const r of records.map(convert)) {
    if (!works.has(r.workKey)) works.set(r.workKey, r.work)
    for (const a of r.authors) {
      if (!authors.has(a.sort_name)) {
        authors.set(a.sort_name, { sort_name: a.sort_name, display_name: a.display_name })
      }
      const key = `${r.workKey}|${a.sort_name}|${a.role}`
      if (!links.has(key)) links.set(key, { workKey: r.workKey, sort_name: a.sort_name, role: a.role, position: a.position })
    }
    copies.push({ workKey: r.workKey, ...r.copy })
  }
  return { works, authors, links: [...links.values()], copies }
}

function report({ works, authors, links, copies }) {
  const count = (pred) => copies.filter(pred).length
  const authorPeople = new Set(links.filter((l) => l.role === 'Author').map((l) => l.sort_name))
  console.log(`Copies (books):        ${copies.length}`)
  console.log(`Works:                 ${works.size}`)
  console.log(`  with 2+ copies:      ${[...works.keys()].filter((k) => copies.filter((c) => c.workKey === k).length > 1).length}`)
  console.log(`People:                ${authors.size}  (${authorPeople.size} in the Author role)`)
  console.log(`Work-person links:     ${links.length}`)
  console.log(`  roles:               ${JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(links, (l) => l.role)).map(([k, v]) => [k, v.length])))}`)
  console.log(`With ISBN-13:          ${count((c) => c.isbn13)}`)
  console.log(`With publisher:        ${count((c) => c.publisher)}`)
  console.log(`With edition year:     ${count((c) => c.edition_year)}`)
  console.log(`With pages:            ${count((c) => c.pages)}`)
  console.log(`Binding:               ${JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(copies, (c) => c.binding ?? 'unknown')).map(([k, v]) => [k, v.length])))}`)
  console.log(`Needs checking:        ${count((c) => c.needs_review)}`)
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

// Insert rows in batches, skipping any that already exist.
async function insertNew(supabase, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + 200), { onConflict, ignoreDuplicates: true })
    if (error) throw new Error(`${table}: ${error.message}`)
    process.stdout.write(`\r  ${table}: ${Math.min(i + 200, rows.length)} of ${rows.length}`)
  }
  process.stdout.write('\n')
}

async function upload({ works, authors, links, copies }) {
  const { supabase, libraryId } = await signIn()
  console.log('Signed in. Uploading…')

  // 1. Works and authors, then look up the ids the database gave them.
  // Works without a LibraryThing work id can't be matched on a re-run, so only
  // insert those if their copy isn't already in the database.
  const existingCopies = new Set(
    (await fetchAll(supabase, 'copies', 'lt_book_id', libraryId)).map((c) => c.lt_book_id),
  )
  const newCopies = copies.filter((c) => !existingCopies.has(c.lt_book_id))
  const neededWorkKeys = new Set(newCopies.map((c) => c.workKey))

  await insertNew(
    supabase, 'works',
    [...works].filter(([k, w]) => w.lt_workcode && neededWorkKeys.has(k)).map(([, w]) => ({ ...w, library_id: libraryId })),
    'library_id,lt_workcode',
  )
  const workIds = new Map(
    (await fetchAll(supabase, 'works', 'id, lt_workcode', libraryId)).map((w) => [w.lt_workcode, w.id]),
  )
  for (const [k, w] of works) {
    if (w.lt_workcode || !neededWorkKeys.has(k)) continue
    const { data, error } = await supabase.from('works').insert({ ...w, library_id: libraryId }).select('id').single()
    if (error) throw error
    workIds.set(k, data.id)
  }
  const workId = (key) => workIds.get(works.get(key).lt_workcode ?? key)

  await insertNew(
    supabase, 'authors',
    [...authors.values()].map((a) => ({ ...a, library_id: libraryId })),
    'library_id,sort_name',
  )
  const authorIds = new Map(
    (await fetchAll(supabase, 'authors', 'id, sort_name', libraryId)).map((a) => [a.sort_name, a.id]),
  )

  // 2. Links between works and people.
  await insertNew(
    supabase, 'work_authors',
    links.filter((l) => neededWorkKeys.has(l.workKey)).map((l) => ({
      library_id: libraryId,
      work_id: workId(l.workKey),
      author_id: authorIds.get(l.sort_name),
      role: l.role,
      position: l.position,
    })),
    'work_id,author_id,role',
  )

  // 3. The copies themselves.
  await insertNew(
    supabase, 'copies',
    newCopies.map(({ workKey, ...c }) => ({ ...c, library_id: libraryId, work_id: workId(workKey) })),
    'library_id,lt_book_id',
  )

  const { count } = await supabase.from('copies').select('*', { count: 'exact', head: true })
  console.log(`Done. The database now has ${count} books.`)
}

// ---------------------------------------------------------------------------

const [file, ...flags] = process.argv.slice(2)
if (!file) {
  console.error('Usage: npm run import:lt -- <export.json> [--dry-run]')
  process.exit(1)
}
const rows = build(Object.values(JSON.parse(readFileSync(file, 'utf8'))))
report(rows)

if (flags.includes('--dry-run')) {
  console.log('\nDry run: nothing was uploaded.')
} else {
  await upload(rows)
}
