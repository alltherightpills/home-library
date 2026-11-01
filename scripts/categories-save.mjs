// Saves the vote's results (src/categories/vote.js) to the library: each book's
// shelves, audience, and what the review list will show. The owner's choices stay.
//
//   npm run categories:save             (sign in; list what would change; saves nothing)
//   npm run categories:save -- --apply  (the same, then asks; needs a backup matching the library)
//
// Writes the list to data/reports/ (kept out of GitHub).

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, csvCell, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'
import { planIsEmpty, planVoteResults } from './lib/vote-plan.mjs'
import { MANUAL_CHOICES } from '../src/categories/manual-choices.js'

const applying = process.argv.includes('--apply')
const TABLES = ['copies', 'categories', 'book_categories', 'lookups']

const { supabase, libraryId } = await signIn()

async function readLibrary() {
  const library = {}
  for (const name of TABLES) library[name] = await fetchTable(supabase, BOOK_TABLES.find((t) => t.name === name), libraryId)
  return library
}

const library = await readLibrary()
if (!library.copies.length || !('category_review' in library.copies[0])) {
  throw new Error('The database is missing the new columns. Run supabase/migrations/20261101_02_vote_results.sql first. Nothing was changed.')
}
const hasOwnerRow = new Set(library.book_categories.filter((r) => r.set_by === 'owner').map((r) => r.copy_id))
const missing = MANUAL_CHOICES.filter((c) => !hasOwnerRow.has(c.copyId))
if (missing.length) {
  throw new Error(`Run npm run categories:setup first: ${missing.length} manual choices aren't saved yet. Nothing was changed.`)
}

const plan = planVoteResults(library)
const count = (test) => plan.books.filter(test).length
console.log(`\n${library.copies.length} books. Saving the vote would:`)
console.log(`  Save shelves:             ${plan.toSave.length} (${plan.toSave.filter((r) => r.is_main).length} main, ${plan.toSave.filter((r) => r.tentative).length} tentative)`)
console.log(`  Remove old vote shelves:  ${plan.toRemove.length}`)
console.log(`  Change book details:      ${plan.booksToChange.length} (audience and review notes)`)
console.log(`  Leave your shelves on:    ${count((b) => b.keepsOwnerShelf)} books`)
console.log(`  No main category:         ${count((b) => !b.keepsOwnerShelf && !b.result.main)} books`)
for (const title of plan.conflicts) console.log(`  Has your "also in" on the vote's main shelf, so no main shelf: ${title}`)

const names = new Map(library.categories.map((c) => [c.id, c.name]))
const rows = [
  ['Title', 'Main category', 'Subcategories', 'Audience', 'Review', 'Suggestions'],
  ...plan.books.map(({ copy, result, keepsOwnerShelf }) => {
    const shelves = plan.wanted.filter((r) => r.copy_id === copy.id)
    return [
      copy.title,
      keepsOwnerShelf ? '(your choice stays)' : names.get(shelves.find((r) => r.is_main)?.category_id) ?? '',
      shelves.filter((r) => !r.is_main).map((r) => names.get(r.category_id) + (r.tentative ? ' (tentative)' : '')).join('; '),
      result.audience,
      keepsOwnerShelf ? '' : result.review.join('; '),
      keepsOwnerShelf || result.subs.length ? '' : result.nearMisses.map((n) => `${n.sub} (${n.score})`).join('; '),
    ]
  }).sort((a, b) => a[0].localeCompare(b[0])),
]
const folder = join(import.meta.dirname, '..', 'data', 'reports')
await mkdir(folder, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_')
const reportFile = join(folder, `categories-save-plan-${stamp}.csv`)
await writeFile(reportFile, '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
console.log(`\nEvery book: ${reportFile}`)

if (!applying) {
  console.log('Nothing was saved. To save this: npm run categories:save -- --apply')
  process.exit(0)
}
if (planIsEmpty(plan)) {
  console.log('Nothing to do.')
  process.exit(0)
}

// The way back is a restore, so the newest backup must hold what this replaces:
// every book, and the vote's results as they are now. Adding the owner's choices
// after the backup is fine; a restore would simply remove them.
const snapshot = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort().at(-1)
if (!snapshot) throw new Error('No backup found. Run npm run backup first. Nothing was changed.')
const backedUp = async (name) => JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${name}.json`), 'utf8').catch(() => '[]'))
const fingerprint = (copies) => JSON.stringify(copies.map((c) => [c.title, c.audience, c.audience_set_by]).sort())
const voteRows = (rows) => rows.filter((r) => r.set_by === 'vote').length
if (
  fingerprint(await backedUp('copies')) !== fingerprint(library.copies) ||
  voteRows(await backedUp('book_categories')) !== voteRows(library.book_categories)
) {
  throw new Error(`The library has changed since backup ${snapshot}. Run npm run backup first. Nothing was changed.`)
}

const answer = await ask(`\nThe way back is backup ${snapshot}. Type SAVE to change the library: `)
if (answer.trim() !== 'SAVE') {
  console.log('Nothing was changed.')
  process.exit(0)
}

function checked({ error }, what) {
  if (error) throw new Error(`${what}: ${error.message}. Running this again carries on from where it stopped.`)
}

// Old shelves first: a book can have only one main shelf at a time.
for (const row of plan.toRemove) {
  checked(await supabase.from('book_categories').delete().eq('copy_id', row.copy_id).eq('category_id', row.category_id).eq('set_by', 'vote'), 'Removing an old shelf')
}
for (let i = 0; i < plan.toSave.length; i += 200) {
  checked(await supabase.from('book_categories').upsert(plan.toSave.slice(i, i + 200)), 'Saving shelves')
  console.log(`Shelves: ${Math.min(i + 200, plan.toSave.length)} of ${plan.toSave.length}`)
}
for (const [i, { copy, changes }] of plan.booksToChange.entries()) {
  checked(await supabase.from('copies').update(changes).eq('id', copy.id), `Saving ${copy.title}`)
  if ((i + 1) % 100 === 0) console.log(`Books: ${i + 1} of ${plan.booksToChange.length}`)
}
console.log(`Books: ${plan.booksToChange.length} saved`)

// Read everything back: a finished save leaves nothing to do.
if (!planIsEmpty(planVoteResults(await readLibrary()))) throw new Error('Some changes did not save. Running this again may finish the job.')
console.log('\nSaved and checked: reading the library back, nothing is left to change.')
