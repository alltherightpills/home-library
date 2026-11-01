// Applies the title cleanup (src/titles/cleanTitle.js) to the library: cleaned
// titles, with the originals saved, plus series, publisher's series, edition notes,
// and notes. Only fills blanks, so hand entries stay, and it's safe to rerun.
//
//   npm run titles:apply             (sign in; list what would change; saves nothing)
//   npm run titles:apply -- --apply  (the same, then asks; needs a backup matching the library)
//
// Writes the list to data/reports/ (kept out of GitHub).

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, csvCell, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'
import { planIsEmpty, planTitleCleanup } from './lib/title-plan.mjs'

const applying = process.argv.includes('--apply')
const TABLES = ['copies', 'series', 'publisher_series', 'copy_series', 'copy_publisher_series']

const { supabase, libraryId } = await signIn()

async function readLibrary() {
  const library = {}
  for (const name of TABLES) library[name] = await fetchTable(supabase, BOOK_TABLES.find((t) => t.name === name), libraryId)
  return library
}

const library = await readLibrary()
const plan = planTitleCleanup(library)
const { books } = plan
const count = (test) => books.filter(test).length

console.log(`\n${library.copies.length} books. The cleanup would change:`)
console.log(`  Titles (originals saved):  ${count((b) => b.changes.title)}`)
console.log(`  Books gaining a series:    ${count((b) => b.seriesLinks.length)}`)
console.log(`  Books gaining a publisher's series: ${count((b) => b.publisherLinks.length)}`)
console.log(`  Edition notes:             ${count((b) => b.changes.edition_note)}`)
console.log(`  Notes:                     ${count((b) => b.changes.notes)}`)
console.log(`  New series on the list:    ${plan.newSeries.length}`)
console.log(`  New publisher's series:    ${plan.newPublisherSeries.length}`)
console.log(`  Still to check:            ${count((b) => b.checks.length)}`)

const labels = (links) => links.map((l) => [l.name, l.number].filter(Boolean).join(' ')).join('; ')
const rows = [
  ['Current title', 'New title', 'Series to add', "Publisher's series to add", 'Edition note', 'Notes', 'To check'],
  ...books
    .map((b) => [
      b.copy.title, b.changes.title ?? '', labels(b.seriesLinks), labels(b.publisherLinks),
      b.changes.edition_note ?? '', b.changes.notes ?? '', b.checks.join('; '),
    ])
    .sort((a, b) => a[0].localeCompare(b[0])),
]
const folder = join(import.meta.dirname, '..', 'data', 'reports')
await mkdir(folder, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_')
const reportFile = join(folder, `titles-apply-plan-${stamp}.csv`)
await writeFile(reportFile, '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
console.log(`\nEvery change: ${reportFile}`)

if (!applying) {
  console.log('Nothing was saved. To apply this: take a backup, then npm run titles:apply -- --apply')
  process.exit(0)
}
if (planIsEmpty(plan)) {
  console.log('Nothing to do.')
  process.exit(0)
}

// The way back is a restore, so the newest backup must match the library as it is now.
const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = snapshots.at(-1)
const snapshotFolder = join(BACKUP_ROOT, snapshot ?? '')
if (!snapshot || !(await stat(join(snapshotFolder, 'copy_series.json')).catch(() => null))) {
  throw new Error('The newest backup was made before the new fields existed. Run npm run backup first. Nothing was changed.')
}
// Without ids, which change when a backup is restored into a test library.
const fingerprint = (rows) => JSON.stringify(rows.map((c) => [c.title, c.original_title, c.edition_note, c.notes]).sort())
const backedUp = JSON.parse(await readFile(join(snapshotFolder, 'copies.json'), 'utf8'))
const linkCount = async (name) => JSON.parse(await readFile(join(snapshotFolder, `${name}.json`), 'utf8')).length
if (
  fingerprint(backedUp) !== fingerprint(library.copies) ||
  (await linkCount('copy_series')) !== library.copy_series.length ||
  (await linkCount('copy_publisher_series')) !== library.copy_publisher_series.length
) {
  throw new Error(`The library has changed since backup ${snapshot}. Run npm run backup first. Nothing was changed.`)
}

const answer = await ask(`\nThe way back is backup ${snapshot}. Type APPLY to change the library: `)
if (answer.trim() !== 'APPLY') {
  console.log('Nothing was changed.')
  process.exit(0)
}

function checked({ error }, what) {
  if (error) throw new Error(`${what}: ${error.message}. Running this again carries on from where it stopped.`)
}

// Lists first, since the links point at them.
async function addToList(table, entries) {
  const ids = new Map()
  for (const { id, name, aliases } of entries) {
    const { data, error } = await supabase.from(table).insert({ library_id: libraryId, name, aliases }).select('id').single()
    checked({ error }, `Adding ${name}`)
    ids.set(id, data.id)
  }
  return ids
}
const seriesIds = await addToList('series', plan.newSeries)
const publisherIds = await addToList('publisher_series', plan.newPublisherSeries)
for (const { id, aliases } of plan.seriesAliases) checked(await supabase.from('series').update({ aliases }).eq('id', id), 'Saving spellings')
for (const { id, aliases } of plan.publisherAliases) checked(await supabase.from('publisher_series').update({ aliases }).eq('id', id), 'Saving spellings')

async function saveLinks(table, idColumn, ids, links) {
  const rows = links.map((link) => ({
    library_id: libraryId,
    copy_id: link.copy_id,
    [idColumn]: ids.get(link[idColumn]) ?? link[idColumn],
    number: link.number,
    position: link.position,
  }))
  for (let i = 0; i < rows.length; i += 200) checked(await supabase.from(table).upsert(rows.slice(i, i + 200)), `Saving ${table}`)
  console.log(`${table}: ${rows.length} saved`)
}
await saveLinks('copy_series', 'series_id', seriesIds, books.flatMap((b) => b.seriesLinks))
await saveLinks('copy_publisher_series', 'publisher_series_id', publisherIds, books.flatMap((b) => b.publisherLinks))

// Titles last: a stopped run can pick up, because each book's changes are worked out afresh.
const changed = books.filter((b) => Object.keys(b.changes).length)
for (const [i, b] of changed.entries()) {
  checked(await supabase.from('copies').update(b.changes).eq('id', b.copy.id), `Saving ${b.copy.title}`)
  if ((i + 1) % 100 === 0) console.log(`Books: ${i + 1} of ${changed.length}`)
}
console.log(`Books: ${changed.length} saved`)

// Read everything back: a finished cleanup leaves nothing to do.
const after = planTitleCleanup(await readLibrary())
if (!planIsEmpty(after)) throw new Error('Some changes did not save. Running this again may finish the job.')
console.log('\nApplied and checked: reading the library back, nothing is left to change.')
