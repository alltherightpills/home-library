// Moves covers to the sharpest image of the same edition, and lists the books
// left with small covers, to photograph or pick by hand.
//
//   npm run covers:upgrade             (sign in; measure covers; list what would change; saves nothing)
//   npm run covers:upgrade -- --apply  (the same, then asks; needs a backup matching the library)
//
// What changes:
//   - A Google cover you picked moves to Google's full size (zoom=0) when that's bigger.
//   - An automatic cover (Open Library's, or none) becomes Google's when Google matched
//     this exact edition by ISBN (the vote's saved `google` lookup) and its image is
//     bigger than Open Library's original upload.
// A cover you picked from Open Library, or a photo, is never changed.
//
// Measuring downloads each Google image in full (often 100 KB to 1 MB) and asks Open
// Library for each cover's size, so the first run takes several minutes. Sizes are kept
// in data/cover-sizes.json, so the next run is quick. Reports go to data/reports/.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, csvCell, fetchTable } from './lib/catalog.mjs'
import { imageSize } from './lib/image-size.mjs'
import { USER_AGENT } from './lib/lookup-tools.mjs'
import { ask, signIn } from './lib/session.mjs'

const applying = process.argv.includes('--apply')
// Wide enough to fill an iPhone screen (about 1,200px), and enough for a gallery tile.
const FULL_SCREEN = 1000
const GALLERY = 400

const { supabase, libraryId } = await signIn()
const read = (name) => fetchTable(supabase, BOOK_TABLES.find((t) => t.name === name), libraryId)
console.log('Signed in. Reading the library…')
const [copies, lookups, credits, authors] = await Promise.all(['copies', 'lookups', 'work_authors', 'authors'].map(read))

const dataFolder = join(import.meta.dirname, '..', 'data')
const cacheFile = join(dataFolder, 'cover-sizes.json')
await mkdir(join(dataFolder, 'reports'), { recursive: true })
const sizes = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      if (res.status === 404) return null
    } catch {
      // A slow or dropped answer: try again.
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  return null
}

// { width, height } of the image at this address, or null if it won't load.
// Google's "image not available" picture is marked as a placeholder.
async function measure(url) {
  if (!(url in sizes)) {
    const buf = await download(url)
    const size = buf && imageSize(buf)
    sizes[url] = size ? { ...size, placeholder: size.width === 575 && size.height === 750 } : null
  }
  return sizes[url]
}

// Open Library's original upload, from the cover's own record.
async function openLibrarySize(id) {
  const key = `openlibrary:${id}`
  if (!(key in sizes)) {
    const buf = await download(`https://covers.openlibrary.org/b/id/${id}.json`)
    try {
      const { width, height } = JSON.parse(buf?.toString() ?? 'null') ?? {}
      sizes[key] = width ? { width, height } : null
    } catch {
      sizes[key] = null
    }
  }
  return sizes[key]
}

const fullSizeGoogle = (url) => `${url.replace(/&zoom=\d+/, '').replace(/&fife=[^&]*/, '')}&zoom=0`

// Google's largest real image starting from one of its links: { url, width, height },
// or null. With only a thumbnail, zoom=0 gives the placeholder, so the link stays.
async function bestGoogle(url) {
  const full = fullSizeGoogle(url)
  const size = await measure(full)
  if (size && !size.placeholder && size.width > 128) return { url: full, ...size }
  const own = await measure(url)
  return own && !own.placeholder ? { url, ...own } : null
}

// The link in a saved Google lookup, as the app tidies it.
function googleLink(data) {
  const links = data?.volumeInfo?.imageLinks ?? {}
  const link = ['large', 'extraLarge', 'medium', 'small', 'thumbnail', 'smallThumbnail'].map((s) => links[s]).find(Boolean)
  return link?.replace(/^http:/, 'https:').replace('&edge=curl', '')
}

// Runs `task` on each item, a few at a time, saving the sizes every so often.
async function eachInTurn(items, task, label) {
  const queue = [...items]
  let done = 0
  const started = Date.now()
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      await task(item)
      if (++done % 50 === 0) {
        await writeFile(cacheFile, JSON.stringify(sizes))
        const left = Math.round(((Date.now() - started) / done) * (items.length - done) / 60000)
        console.log(`${label}: ${done} of ${items.length}${left ? ` (~${left} min left)` : ''}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  await writeFile(cacheFile, JSON.stringify(sizes))
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const google = new Map(lookups.filter((l) => l.source === 'google' && l.found).map((l) => [l.isbn, l.data]))
const authorById = new Map(authors.map((a) => [a.id, a]))
const bylineOf = (workId) =>
  credits
    .filter((c) => c.work_id === workId)
    .sort((a, b) => a.position - b.position)
    .map((c) => authorById.get(c.author_id)?.display_name)
    .filter(Boolean)
    .join(', ')

const isGoogle = (url) => url?.includes('books.google')
const SOURCE_NAMES = {
  openlibrary_edition: 'Open Library (this edition)', openlibrary_work: 'Open Library (another edition)',
  picked_openlibrary: 'Open Library (picked)', picked_google: 'Google (picked)', google: 'Google', photo: 'Photo',
}

const books = []
await eachInTurn(copies, async (copy) => {
  const before = copy.cover_url ? await measure(copy.cover_url) : copy.cover_id ? await openLibrarySize(copy.cover_id) : null
  const automatic = !copy.cover_source || copy.cover_source.startsWith('openlibrary_')
  let change = null
  let after = before
  if (!automatic && isGoogle(copy.cover_url)) {
    const best = await bestGoogle(copy.cover_url)
    if (best && best.url !== copy.cover_url && best.width > (before?.width ?? 0)) {
      change = { cover_url: best.url }
      after = best
    }
  } else if (automatic) {
    const data = google.get(copy.isbn13 ?? copy.isbn10 ?? `copy:${copy.id}`)
    const link = data?.matched_by === 'isbn' && googleLink(data)
    const best = link && (await bestGoogle(link))
    if (best && best.width > (before?.width ?? 0)) {
      change = { cover_url: best.url, cover_source: 'google' }
      after = best
    }
  }
  books.push({ copy, before, after, change })
}, 'Measured')

const changes = books.filter((b) => b.change)
const width = (b) => b.after?.width ?? 0
console.log(`\n${copies.length} books. Upgrading covers would:`)
console.log(`  Move your Google picks to full size:   ${changes.filter((b) => !b.change.cover_source).length}`)
console.log(`  Switch to Google (same edition):       ${changes.filter((b) => b.change.cover_source).length} (${changes.filter((b) => b.change.cover_source && !b.before).length} of them with no cover now)`)
console.log('Covers afterwards:')
console.log(`  Sharp full-screen (${FULL_SCREEN}px wide or more): ${books.filter((b) => width(b) >= FULL_SCREEN).length}`)
console.log(`  Fine in the gallery (${GALLERY}–${FULL_SCREEN - 1}px):     ${books.filter((b) => width(b) >= GALLERY && width(b) < FULL_SCREEN).length}`)
console.log(`  Small (under ${GALLERY}px):                ${books.filter((b) => b.after && width(b) < GALLERY).length}`)
console.log(`  No cover:                           ${books.filter((b) => !b.after).length}`)

const sizeText = (s) => (s ? `${s.width} × ${s.height}` : '')
const sourceAfter = (b) => SOURCE_NAMES[b.change?.cover_source ?? b.copy.cover_source] ?? (b.copy.cover_source || 'none')
const rows = books
  .map((b) => [
    b.copy.title, bylineOf(b.copy.work_id), SOURCE_NAMES[b.copy.cover_source] ?? 'none', sizeText(b.before),
    b.change ? (b.change.cover_source ? 'Switch to Google' : 'Google full size') : '', sizeText(b.after), sourceAfter(b),
  ])
  .sort((a, b) => a[0].localeCompare(b[0]))
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_')
const writeCsv = (file, table) => writeFile(file, '﻿' + table.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
const planFile = join(dataFolder, 'reports', `covers-plan-${stamp}.csv`)
await writeCsv(planFile, [['Title', 'Author', 'Cover now', 'Size now', 'Change', 'Size after', 'Cover after'], ...rows])

// Books still without a cover fit to fill the screen, smallest first: what to photograph.
const toPhotograph = books
  .filter((b) => width(b) < FULL_SCREEN)
  .sort((a, b) => width(a) - width(b) || a.copy.title.localeCompare(b.copy.title))
  .map((b) => [b.copy.title, bylineOf(b.copy.work_id), b.copy.isbn13 ?? b.copy.isbn10 ?? '', sizeText(b.after) || 'no cover', sourceAfter(b)])
const photoFile = join(dataFolder, 'reports', `covers-to-photograph-${stamp}.csv`)
await writeCsv(photoFile, [['Title', 'Author', 'ISBN', 'Cover size after', 'Cover from'], ...toPhotograph])
console.log(`\nEvery book: ${planFile}\nSmaller than full-screen, smallest first: ${photoFile}`)

if (!applying) {
  console.log('Nothing was saved. To save this: npm run covers:upgrade -- --apply')
  process.exit(0)
}
if (!changes.length) {
  console.log('Nothing to do.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

// The way back is a restore, so the newest backup must hold every cover as it is now.
const snapshot = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort().at(-1)
if (!snapshot) throw new Error('No backup found. Run npm run backup first. Nothing was changed.')
const backedUp = JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, 'copies.json'), 'utf8'))
const fingerprint = (rows) => JSON.stringify(rows.map((c) => [c.id, c.cover_id, c.cover_url, c.cover_source]).sort())
if (fingerprint(backedUp) !== fingerprint(copies)) {
  throw new Error(`Covers have changed since backup ${snapshot}. Run npm run backup first. Nothing was changed.`)
}

const answer = await ask(`\nThe way back is backup ${snapshot}. Type UPGRADE to change ${changes.length} covers: `)
if (answer.trim() !== 'UPGRADE') {
  console.log('Nothing was changed.')
  process.exit(0)
}

for (const [i, { copy, change }] of changes.entries()) {
  const { error } = await supabase.from('copies').update(change).eq('id', copy.id)
  if (error) throw new Error(`Saving ${copy.title}: ${error.message}. Running this again carries on from where it stopped.`)
  if ((i + 1) % 100 === 0) console.log(`Covers: ${i + 1} of ${changes.length}`)
}

// Read the covers back: every change should be there.
const now = new Map((await read('copies')).map((c) => [c.id, c]))
const missed = changes.filter(({ copy, change }) => Object.entries(change).some(([k, v]) => now.get(copy.id)?.[k] !== v))
if (missed.length) throw new Error(`${missed.length} covers did not save. Running this again may finish the job.`)
console.log(`\nSaved and checked: ${changes.length} covers upgraded.`)
