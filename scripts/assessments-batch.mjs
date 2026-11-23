// Makes the next batch for Pick for me's assessment pass (handoff.md, "Slice D
// process"). Reads only a backup: no sign-in, changes nothing.
//
//   npm run assessments:batch                      (75 adult books, newest backup)
//   npm run assessments:batch -- --size 60
//   npm run assessments:batch -- --kids-teen       (kids and teen books, once adults are done)
//   npm run assessments:batch -- --backup 2026-11-20_1049
//
// Writes two files to data/assessments/ (kept out of GitHub):
//   batch-NN-<date>-worksheet.md   the facts Claude judges each book by
//   batch-NN-<date>.md             the review file: Claude fills it in, the owner
//                                  checks it, `npm run assessments:save` saves it

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, SNAPSHOT_NAME } from './lib/catalog.mjs'
import { bookFacts, catalogCopies, descriptionsByKey, groupName, remainingBooks, reviewText, worksheetText } from '../src/assessmentBatch.js'

const option = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const size = Number(option('--size') ?? 75)
if (!Number.isInteger(size) || size < 1) throw new Error('--size must be a whole number, like --size 60')
const audience = process.argv.includes('--kids-teen') ? 'kids-teen' : 'adult'

const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = option('--backup') ?? snapshots.at(-1)
if (!snapshots.includes(snapshot)) throw new Error(`No backup named "${snapshot}". Backups: ${snapshots.join(', ') || 'none'}`)

// A batch made from a backup older than the last batch file may repeat books
// that were loaded since: run a backup first.
const folder = join(import.meta.dirname, '..', 'data', 'assessments')
const batchFiles = (await readdir(folder)).filter((n) => /^batch-\d+-.*\.md$/.test(n) && !n.endsWith('-worksheet.md')).sort()
const backupMade = JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, 'info.json'), 'utf8')).made_at
const last = batchFiles.at(-1)
if (last && (await stat(join(folder, last))).mtime > new Date(backupMade) && !process.argv.includes('--anyway')) {
  throw new Error(
    `Backup ${snapshot} is older than ${last}. If that batch has been saved, run "npm run backup" first, ` +
      'or this batch would repeat its books. (Add --anyway to go ahead regardless.) Nothing was written.',
  )
}

const load = async (table) => JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${table}.json`), 'utf8'))
const tables = Object.fromEntries(
  await Promise.all(
    ['copies', 'works', 'authors', 'work_authors', 'book_categories', 'assessments', 'categories', 'readings', 'lookups'].map(async (t) => [t, await load(t)]),
  ),
)
const copies = catalogCopies(tables)
const { categories, readings } = tables
const remaining = remainingBooks(copies, { readings, categories, audience })
if (!remaining.length) {
  console.log(`No ${audience} books left to assess in backup ${snapshot}.`)
  process.exit(0)
}

const descriptions = descriptionsByKey(tables.lookups)
const facts = remaining.slice(0, size).map((copy) => bookFacts(copy, { copies, categories, descriptions }))
const batch = String(Number(last?.match(/^batch-(\d+)/)[1] ?? 0) + 1).padStart(2, '0')
const name = `batch-${batch}-${new Date().toLocaleDateString('en-CA')}`
const left = remaining.length - facts.length
await writeFile(join(folder, `${name}-worksheet.md`), worksheetText(facts, { batch, snapshot, remaining: left }))
await writeFile(join(folder, `${name}.md`), reviewText(facts, { batch, snapshot }), { flag: 'wx' })

const withDescription = facts.filter((f) => f.description).length
const groups = new Map()
for (const copy of remaining.slice(0, size)) {
  const name = groupName(copy, categories)
  groups.set(name, (groups.get(name) ?? 0) + 1)
}
console.log(`Batch ${batch}: ${facts.length} ${audience} books from backup ${snapshot} (${withDescription} with a saved description).`)
console.log(`Groups: ${[...groups].map(([name, n]) => `${name} ${n}`).join(', ')}`)
console.log(`${left} ${audience} books left after this batch.`)
console.log(`\nWrote data/assessments/${name}-worksheet.md and data/assessments/${name}.md`)
