// Puts the catalog back the way it was in a backup made by "npm run backup".
//
//   npm run restore                        (newest snapshot)
//   npm run restore -- 2026-10-28_0903     (a particular snapshot)
//
// Signed in to the library that was backed up, it makes that library match the
// snapshot: rows changed or deleted since are put back, rows added since are
// removed. Signed in to a different account whose library is empty, it fills
// that library with a copy (new ids), which is how to test a restore safely,
// or how to rebuild after starting over in a new Supabase project.
//
// It shows what it would do and changes nothing until you type RESTORE. Safe to
// rerun if stopped partway: each run only does what is still left to do. After
// writing, it reads everything back and checks it against the snapshot.

import { randomUUID } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, PHOTO_PATH, SNAPSHOT_NAME, booksCsv, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'

const byName = Object.fromEntries(BOOK_TABLES.map((t) => [t.name, t]))
const keyOf = (table, row) => table.key.map((c) => row[c]).join('|')

// A row as text, with object keys in a fixed order so equal rows give equal text.
// updated_at is left out: the database sets it itself whenever a row is written.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter((k) => k !== 'updated_at').sort().map((k) => [k, canonical(value[k])]))
  }
  return value
}
const sameRow = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

// What it takes to turn `current` into `wanted`, table by table.
function compare(wanted, current) {
  const plan = {}
  for (const table of BOOK_TABLES) {
    const now = new Map(current[table.name].map((row) => [keyOf(table, row), row]))
    const wantedKeys = new Set()
    const put = []
    let added = 0
    for (const row of wanted[table.name]) {
      const key = keyOf(table, row)
      wantedKeys.add(key)
      if (!now.has(key)) added++
      if (!now.has(key) || !sameRow(row, now.get(key))) put.push(row)
    }
    const remove = current[table.name].filter((row) => !wantedKeys.has(keyOf(table, row)))
    plan[table.name] = { put, added, changed: put.length - added, remove }
  }
  return plan
}

// The snapshot's rows moved into another library: every id is replaced with a
// new one (ids are shared by all libraries, so the originals are taken).
function copyIntoLibrary(tables, libraryId) {
  const newIds = new Map()
  const newId = (old) => {
    if (!newIds.has(old)) newIds.set(old, randomUUID())
    return newIds.get(old)
  }
  const moved = (row, changes) => ({ ...row, library_id: libraryId, ...changes })
  return {
    authors: tables.authors.map((r) => moved(r, { id: newId(r.id) })),
    works: tables.works.map((r) => moved(r, { id: newId(r.id) })),
    work_authors: tables.work_authors.map((r) => moved(r, { work_id: newId(r.work_id), author_id: newId(r.author_id) })),
    copies: tables.copies.map((r) => moved(r, { id: newId(r.id), work_id: newId(r.work_id) })),
    lookups: tables.lookups.map((r) => moved(r, {})),
  }
}

// ---------------------------------------------------------------------------
// Load the snapshot and sign in
// ---------------------------------------------------------------------------

const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = process.argv[2] ?? snapshots.at(-1)
if (!snapshots.includes(snapshot)) {
  throw new Error(`No backup named "${snapshot}" in ${BACKUP_ROOT}. Backups there: ${snapshots.join(', ') || 'none'}`)
}
const folder = join(BACKUP_ROOT, snapshot)
const info = JSON.parse(await readFile(join(folder, 'info.json'), 'utf8'))
const backup = {}
for (const table of BOOK_TABLES) backup[table.name] = JSON.parse(await readFile(join(folder, `${table.name}.json`), 'utf8'))
console.log(`Backup ${snapshot}: ${backup.copies.length} books.\n`)

const { supabase, libraryId } = await signIn()
const readLibrary = async () => {
  const tables = {}
  for (const table of BOOK_TABLES) tables[table.name] = await fetchTable(supabase, table, libraryId)
  return tables
}
const current = await readLibrary()

const sameLibrary = libraryId === info.library_id
if (!sameLibrary && BOOK_TABLES.some((t) => current[t.name].length)) {
  throw new Error(
    `This account's library isn't the one in the backup, and it already has books in it. ` +
      `Restoring into a different library only works when that library is empty.`,
  )
}
const wanted = sameLibrary ? backup : copyIntoLibrary(backup, libraryId)

// Cover photos: each photo cover's file must be in this library's folder, and
// its web address must point there (it changes with the library or project).
const bucket = supabase.storage.from('covers')
const { data: storedPhotos, error: listError } = await bucket.list(libraryId, { limit: 10000 })
if (listError) throw new Error(`Listing photos: ${listError.message}`)
const stored = new Set(storedPhotos.map((f) => f.name))
const photosToUpload = []
const missingPhotos = []
for (const copy of wanted.copies) {
  if (!copy.cover_url?.includes(PHOTO_PATH)) continue
  const file = copy.cover_url.split('/').at(-1)
  const path = `${libraryId}/${file}`
  copy.cover_url = bucket.getPublicUrl(path).data.publicUrl
  if (stored.has(file)) continue
  const local = join(BACKUP_ROOT, 'photos', info.library_id, file)
  if (await stat(local).then(() => true, () => false)) photosToUpload.push({ local, path })
  else missingPhotos.push(`${copy.title} (${file})`)
}

// ---------------------------------------------------------------------------
// Show the plan and ask
// ---------------------------------------------------------------------------

const plan = compare(wanted, current)
console.log(sameLibrary ? '\nTo match the backup, this library needs:' : `\nThe empty library ${libraryId} will get:`)
for (const table of BOOK_TABLES) {
  const { added, changed, remove } = plan[table.name]
  console.log(`  ${table.name.padEnd(13)} ${added} to add back, ${changed} to change back, ${remove.length} to remove`)
}
console.log(`  photos        ${photosToUpload.length} to upload`)
if (missingPhotos.length) {
  console.log(`\nThese photo covers aren't in the backup's photos folder and can't be put back:\n  ${missingPhotos.join('\n  ')}`)
}

const nothingToDo = BOOK_TABLES.every((t) => !plan[t.name].put.length && !plan[t.name].remove.length) && !photosToUpload.length
if (nothingToDo) {
  console.log('\nThe catalog already matches this backup. Nothing was changed.')
  process.exit(0)
}

console.log(
  sameLibrary
    ? '\nThis rewrites your real catalog to match the backup; anything done since it was made will be lost.' +
        '\nIf you might want any of that back, stop here and run "npm run backup" first.'
    : '\nThis only fills the library of the account you just signed in with.',
)
if ((await ask('Type RESTORE to go ahead (anything else stops): ')).trim() !== 'RESTORE') {
  console.log('Stopped. Nothing was changed.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Write: clear out rows that would block, add parents before the rows that
// point at them, and remove unwanted parents last, once nothing points at them.
// ---------------------------------------------------------------------------

async function putRows({ name, primaryKey }, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(name).upsert(rows.slice(i, i + 200), { onConflict: primaryKey })
    if (error) throw new Error(`Writing ${name}: ${error.message}`)
  }
}

async function removeRows({ name, key }, rows) {
  // Rows that share every key column but the last are removed together.
  const groups = new Map()
  for (const row of rows) {
    const fixed = key.slice(0, -1).map((c) => row[c])
    const id = JSON.stringify(fixed)
    if (!groups.has(id)) groups.set(id, { fixed, last: [] })
    groups.get(id).last.push(row[key.at(-1)])
  }
  for (const { fixed, last } of groups.values()) {
    for (let i = 0; i < last.length; i += 100) {
      let query = supabase.from(name).delete().eq('library_id', libraryId)
      fixed.forEach((value, j) => (query = query.eq(key[j], value)))
      const { error } = await query.in(key.at(-1), last.slice(i, i + 100))
      if (error) throw new Error(`Removing from ${name}: ${error.message}`)
    }
  }
}

for (const name of ['work_authors', 'copies', 'lookups']) await removeRows(byName[name], plan[name].remove)
for (const { local, path } of photosToUpload) {
  const { error } = await bucket.upload(path, await readFile(local), { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Uploading photo ${path}: ${error.message}`)
}
for (const name of ['authors', 'works', 'work_authors', 'copies', 'lookups']) {
  await putRows(byName[name], plan[name].put)
  console.log(`${name}: done`)
}
for (const name of ['works', 'authors']) await removeRows(byName[name], plan[name].remove)

// ---------------------------------------------------------------------------
// Check: read everything back and compare, row by row and as books.csv
// ---------------------------------------------------------------------------

const after = await readLibrary()
const leftOver = compare(wanted, after)
const problems = BOOK_TABLES.filter((t) => leftOver[t.name].put.length || leftOver[t.name].remove.length)
const csvMatches = booksCsv(after) === booksCsv(backup)
if (problems.length || !csvMatches) {
  for (const t of problems) {
    console.log(`${t.name}: ${leftOver[t.name].put.length} rows still differ, ${leftOver[t.name].remove.length} extra`)
  }
  if (!csvMatches) console.log('books.csv made from the restored catalog does not match the backup.')
  throw new Error('The restore did not fully match the backup (see above). Running it again may finish the job.')
}
console.log(`\nRestored and checked: all ${after.copies.length} books match backup ${snapshot}.`)
if (!sameLibrary) console.log(`(Restored into library ${libraryId}.)`)
