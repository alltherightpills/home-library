// Saves a copy of the whole catalog to ~/Documents/Home Library Backups (which
// iCloud syncs), outside this project so it never goes to GitHub.
//
//   npm run backup
//
// Each run adds a dated snapshot folder holding every table as JSON (for
// restoring) and books.csv (for reading in Numbers or Excel). Only the newest
// KEEP snapshots are kept. Cover photos go in one shared photos folder, and only
// photos not already there are downloaded; photos are never deleted from it.

import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, LIBRARY_TABLES, SNAPSHOT_NAME, booksCsv, fetchTable } from './lib/catalog.mjs'
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
