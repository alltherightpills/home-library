// Saves a copy of the whole catalog to ~/Documents/Home Library Backups (which
// iCloud syncs), outside this project so it never goes to GitHub.
//
//   npm run backup
//
// Each run adds a dated snapshot folder holding every table as JSON (for
// restoring) and books.csv (for reading in Numbers or Excel). Only the newest
// KEEP snapshots are kept. Cover photos go in one shared photos folder, and only
// photos not already there are downloaded; photos are never deleted from it.
// Copies of the Open Library and Google covers go in a shared covers folder the
// same way, after the snapshot is finished (the first run takes several minutes).

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, LIBRARY_TABLES, PHOTO_PATH, SNAPSHOT_NAME, booksCsv, fetchTable } from './lib/catalog.mjs'
import { imageSize } from './lib/image-size.mjs'
import { download } from './lib/lookup-tools.mjs'
import { signIn } from './lib/session.mjs'

const KEEP = 30

const exists = (path) => stat(path).then(() => true, () => false)

// Downloads photos not yet in the backup; returns [how many new, how many total].
async function backUpPhotos(supabase, libraryId) {
  const bucket = supabase.storage.from('covers')
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(libraryId, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`Listing photos: ${error.message}`)
    // Folders have no id; names starting with a dot are Supabase's placeholders.
    files.push(...data.filter((f) => f.id && !f.name.startsWith('.')))
    if (data.length < 1000) break
  }

  const folder = join(BACKUP_ROOT, 'photos', libraryId)
  await mkdir(folder, { recursive: true })
  let added = 0
  for (const file of files) {
    const target = join(folder, file.name)
    if (await exists(target)) continue
    const { data, error } = await bucket.download(`${libraryId}/${file.name}`)
    if (error) throw new Error(`Downloading photo ${file.name}: ${error.message}`)
    // Write under a temporary name first, so a stopped run never leaves half a photo.
    await writeFile(`${target}.partial`, Buffer.from(await data.arrayBuffer()))
    await rename(`${target}.partial`, target)
    added++
  }
  return [added, files.length]
}

// Covers from Open Library and Google are links in the app; a copy of each image is
// kept here in case a link stops working. covers/<library>/links.json says which
// file holds which link, so only new or changed covers are downloaded. Files are
// never deleted. Returns { added, total, failed: [titles] }.
async function backUpCovers(copies, libraryId) {
  const folder = join(BACKUP_ROOT, 'covers', libraryId)
  await mkdir(folder, { recursive: true })
  const indexFile = join(folder, 'links.json')
  const files = JSON.parse(await readFile(indexFile, 'utf8').catch(() => '{}'))
  const saveIndex = async () => {
    await writeFile(`${indexFile}.partial`, JSON.stringify(files, null, 1))
    await rename(`${indexFile}.partial`, indexFile)
  }

  // One link per cover, as the book page shows it (Open Library's original upload).
  const titles = new Map()
  for (const copy of copies) {
    const link = copy.cover_url ?? (copy.cover_id && `https://covers.openlibrary.org/b/id/${copy.cover_id}.jpg`)
    if (!link || link.includes(PHOTO_PATH)) continue
    if (!titles.has(link)) titles.set(link, copy.title)
  }
  const missing = []
  for (const link of titles.keys()) {
    if (!files[link] || !(await exists(join(folder, files[link])))) missing.push(link)
  }

  const failed = []
  let added = 0
  const worker = async () => {
    for (let link = missing.shift(); link; link = missing.shift()) {
      const buf = await download(link)
      // Open Library answers a missing cover with a blank 1-pixel image, not an error.
      const type = buf && imageSize(buf)?.width !== 1 && imageType(buf)
      if (!type) {
        failed.push(titles.get(link))
        continue
      }
      const file = `${coverFileName(link)}.${type}`
      await writeFile(join(folder, `${file}.partial`), buf)
      await rename(join(folder, `${file}.partial`), join(folder, file))
      files[link] = file
      if (++added % 100 === 0) {
        await saveIndex()
        console.log(`covers: ${added} downloaded, ${missing.length} to go`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  await saveIndex()
  return { added, total: titles.size, failed }
}

// openlibrary-<cover id>, or google-<volume id>-<short fingerprint of the link>
// (the same book can be saved at different sizes).
function coverFileName(link) {
  const openLibrary = link.match(/covers\.openlibrary\.org\/b\/id\/(\d+)/)
  if (openLibrary) return `openlibrary-${openLibrary[1]}`
  const hash = createHash('sha1').update(link).digest('hex').slice(0, 8)
  const google = link.match(/[?&]id=([\w-]+)/)
  return link.includes('books.google') && google ? `google-${google[1]}-${hash}` : `link-${hash}`
}

// The file type from an image's first bytes; null if it isn't an image (an error page).
function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png'
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

// ---------------------------------------------------------------------------

const README = `Home Library backups
====================

Made by "npm run backup" in the home-library project.

Each dated folder (year-month-day_hourminute) is a complete copy of the catalog
at that moment:
  books.csv        one row per book; open in Numbers or Excel to look things over
  <table>.json     every row of each database table, exactly as stored; these are
                   what a restore uses
  info.json        when the snapshot was made and how many rows each table had

photos/ holds every cover photo taken in the app. It is shared by all snapshots
and only ever grows: a photo replaced in the app stays here.

covers/ holds a copy of every cover the app links to on Open Library or Google,
in case a link stops working. Files are named by where they came from
(openlibrary-<cover id>, google-<book id>-...); links.json says which link each
file was saved from, and a snapshot's copies.json gives each book's link. Like
photos/, it is shared and only ever grows.

Only the newest ${KEEP} snapshots are kept; older ones are deleted automatically.

Restoring: "npm run restore" (newest snapshot) or "npm run restore -- <folder name>".
It shows what it would change and does nothing until you type RESTORE.
`

function snapshotName(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}

const { supabase, libraryId } = await signIn()
const startedAt = new Date()
const name = snapshotName(startedAt)
const finalFolder = join(BACKUP_ROOT, name)
if (await exists(finalFolder)) throw new Error(`A backup named ${name} already exists; wait a minute and try again.`)

// Build the snapshot under a temporary name, so a stopped run never looks complete.
const workFolder = `${finalFolder}.in-progress`
await rm(workFolder, { recursive: true, force: true })
await mkdir(workFolder, { recursive: true })

const tables = {}
for (const table of [...LIBRARY_TABLES, ...BOOK_TABLES]) {
  tables[table.name] = await fetchTable(supabase, table, libraryId)
  await writeFile(join(workFolder, `${table.name}.json`), JSON.stringify(tables[table.name], null, 1))
  console.log(`${table.name}: ${tables[table.name].length} rows`)
}
await writeFile(join(workFolder, 'books.csv'), booksCsv(tables))
const counts = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]))
await writeFile(join(workFolder, 'info.json'), JSON.stringify({ made_at: startedAt.toISOString(), library_id: libraryId, rows: counts }, null, 2))

const [newPhotos, totalPhotos] = await backUpPhotos(supabase, libraryId)
console.log(`photos: ${newPhotos} new, ${totalPhotos} in the app`)

await rename(workFolder, finalFolder)
await writeFile(join(BACKUP_ROOT, 'README.txt'), README)

// Keep only the newest snapshots (names sort by date).
const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
for (const old of snapshots.slice(0, -KEEP)) {
  await rm(join(BACKUP_ROOT, old), { recursive: true })
  console.log(`Removed old backup ${old}`)
}
console.log(`\nSaved to ${finalFolder}`)

// The snapshot is complete, so a slow cover site or a stopped run can't spoil it.
console.log('\nCopying covers…')
const covers = await backUpCovers(tables.copies, libraryId)
console.log(`covers: ${covers.added} new, ${covers.total - covers.failed.length} of ${covers.total} copied`)
if (covers.failed.length) {
  console.log(`These ${covers.failed.length} covers wouldn't download; the next backup tries them again:`)
  for (const title of covers.failed.slice(0, 10)) console.log(`  ${title}`)
  if (covers.failed.length > 10) console.log(`  …and ${covers.failed.length - 10} more`)
}
