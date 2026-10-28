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
import { homedir } from 'node:os'
import { join } from 'node:path'
import { signIn } from './lib/session.mjs'

const BACKUP_ROOT = join(homedir(), 'Documents', 'Home Library Backups')
const KEEP = 30
const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}_\d{4}$/

// Each table, the column that ties its rows to a library, and an order that
// identifies each row exactly (so reading 1,000 at a time never skips a row).
const TABLES = [
  { name: 'libraries', libraryColumn: 'id', order: ['id'] },
  { name: 'library_members', libraryColumn: 'library_id', order: ['user_id'] },
  { name: 'works', libraryColumn: 'library_id', order: ['id'] },
  { name: 'authors', libraryColumn: 'library_id', order: ['id'] },
  { name: 'work_authors', libraryColumn: 'library_id', order: ['work_id', 'author_id', 'role'] },
  { name: 'copies', libraryColumn: 'library_id', order: ['id'] },
  { name: 'lookups', libraryColumn: 'library_id', order: ['source', 'isbn'] },
]

async function fetchTable(supabase, { name, libraryColumn, order }, libraryId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(name).select('*').eq(libraryColumn, libraryId)
    for (const column of order) query = query.order(column)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw new Error(`Reading ${name}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

// ---------------------------------------------------------------------------
// books.csv: one row per book, in words a person can check at a glance
// ---------------------------------------------------------------------------

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function booksCsv({ works, authors, work_authors, copies }) {
  const workById = new Map(works.map((w) => [w.id, w]))
  const authorById = new Map(authors.map((a) => [a.id, a]))
  const creditsByWork = new Map()
  for (const credit of [...work_authors].sort((a, b) => a.position - b.position)) {
    const name = authorById.get(credit.author_id)?.display_name ?? '?'
    const label = credit.role === 'Author' ? name : `${name} (${credit.role})`
    creditsByWork.set(credit.work_id, [...(creditsByWork.get(credit.work_id) ?? []), label])
  }

  const columns = {
    'Title': (c) => c.title,
    'Authors': (c) => (creditsByWork.get(c.work_id) ?? []).join('; '),
    'Publisher': (c) => c.publisher,
    'Edition year': (c) => c.edition_year,
    'First published': (c) => workById.get(c.work_id)?.first_published_year,
    'ISBN-13': (c) => c.isbn13,
    'ISBN-10': (c) => c.isbn10,
    'Pages': (c) => c.pages,
    'Binding': (c) => c.binding,
    'Languages': (c) => c.languages.join('; '),
    'LC call number': (c) => c.lc_call_number ?? c.lcc,
    'Dewey': (c) => c.dewey,
    'Subjects': (c) => c.subjects.map((parts) => parts.join(' -- ')).join('; '),
    'Date cataloged': (c) => c.added_on,
    'Cover source': (c) => c.cover_source,
    'Needs review': (c) => (c.needs_review ? 'yes' : ''),
    'Review note': (c) => c.review_note,
  }
  const sorted = [...copies].sort((a, b) => a.title.localeCompare(b.title))
  const lines = [Object.keys(columns).map(csvCell).join(',')]
  for (const copy of sorted) lines.push(Object.values(columns).map((get) => csvCell(get(copy))).join(','))
  // The invisible mark at the start tells Excel the file is UTF-8, so accents survive.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Cover photos
// ---------------------------------------------------------------------------

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
                   what a restore would use
  info.json        when the snapshot was made and how many rows each table had

photos/ holds every cover photo taken in the app. It is shared by all snapshots
and only ever grows: a photo replaced in the app stays here.

Only the newest ${KEEP} snapshots are kept; older ones are deleted automatically.

Restoring: there is no restore command yet. The .json files hold everything
needed to rebuild the catalog; ask for a restore script to be written for the
snapshot you want, and test it on a copy before using it on the real catalog.
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
for (const table of TABLES) {
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
