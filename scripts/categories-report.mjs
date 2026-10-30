// Tries the category rules (src/categories/category-rules.js) on a backup and
// reports the result. Reads only the backup files: no sign-in, changes nothing.
//
//   npm run categories:report                       (newest backup)
//   npm run categories:report -- 2026-10-28_1544    (a particular one)
//
// Prints a summary and writes every book's categories, and the clue that put it
// there, to data/reports/ (kept out of GitHub) for checking in Numbers or Excel.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, SNAPSHOT_NAME, csvCell } from './lib/catalog.mjs'
import { MAIN_CATEGORIES, SUBCATEGORY_RULES } from '../src/categories/category-rules.js'
import { categorize } from '../src/categories/categorize.js'

const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = process.argv[2] ?? snapshots.at(-1)
if (!snapshots.includes(snapshot)) throw new Error(`No backup named "${snapshot}". Backups: ${snapshots.join(', ') || 'none'}`)
const load = async (table) => JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${table}.json`), 'utf8'))
const [copies, authors, workAuthors] = await Promise.all(['copies', 'authors', 'work_authors'].map(load))

const authorById = new Map(authors.map((a) => [a.id, a.display_name]))
const authorsByWork = new Map()
for (const credit of [...workAuthors].sort((a, b) => a.position - b.position)) {
  authorsByWork.set(credit.work_id, [...(authorsByWork.get(credit.work_id) ?? []), authorById.get(credit.author_id)])
}

// What LibraryThing's genres alone would suggest, to compare with the rules.
const LT_MAIN = {
  'Poetry': 'Poetry', 'Comics': 'Comics & Graphic Novels', 'Biography & Memoir': 'Biography & Memoir',
  'Fiction': 'Fiction', 'General Fiction': 'Fiction', 'Nonfiction': 'Nonfiction', 'General Nonfiction': 'Nonfiction',
}
const ltSays = (genres) => [...new Set(genres.map((g) => LT_MAIN[g]).filter(Boolean))]

const books = copies.map((copy) => {
  const result = categorize(copy)
  const lt = ltSays(copy.lt_genres)
  const review = []
  if (!result.main) review.push('no category')
  else if (result.mainBecause.startsWith('LibraryThing')) review.push('only LibraryThing genre')
  else if (result.mainBecause.startsWith('title')) review.push('only the title')
  if (result.main && lt.length && !lt.includes(result.main)) review.push(`LibraryThing says ${lt.join(' / ')}`)
  return { copy, ...result, lt, review }
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pct = (n) => `${Math.round((100 * n) / books.length)}%`
const count = (list, key) => list.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map())

console.log(`Backup ${snapshot}: ${books.length} books\n`)
for (const main of [...MAIN_CATEGORIES, null]) {
  const inMain = books.filter((b) => b.main === main)
  if (!inMain.length) continue
  const audiences = count(inMain, (b) => b.audience)
  const audienceText = ['Adult', 'Teen', 'Kids'].map((a) => `${audiences.get(a) ?? 0} ${a.toLowerCase()}`).join(', ')
  console.log(`${main ?? 'NO CATEGORY'}: ${inMain.length} (${audienceText})`)
  if (!main) continue
  for (const { sub } of SUBCATEGORY_RULES[main] ?? []) {
    console.log(`    ${String(inMain.filter((b) => b.subs.some((s) => s.sub === sub)).length).padStart(4)}  ${sub}`)
  }
  if (SUBCATEGORY_RULES[main]) console.log(`    ${String(inMain.filter((b) => !b.subs.length).length).padStart(4)}  (no subcategory)`)
}

const decidedBy = count(books.filter((b) => b.main), (b) => b.mainBecause.split(' ')[0].replace('LibraryThing', 'LibraryThing genre'))
console.log(`\nMain category decided by: ${[...decidedBy].map(([k, n]) => `${k} ${n} (${pct(n)})`).join(', ')}`)

const disagreements = count(books.filter((b) => b.review.some((r) => r.startsWith('LibraryThing says'))),
  (b) => `rules: ${b.main}  ·  LibraryThing: ${b.lt.join(' / ')}`)
console.log(`\nWhere the rules and LibraryThing's genres disagree (${[...disagreements.values()].reduce((a, b) => a + b, 0)} books):`)
for (const [pattern, n] of [...disagreements].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${pattern}`)

// ---------------------------------------------------------------------------
// Every book, for checking
// ---------------------------------------------------------------------------

const columns = {
  'Main category': (b) => b.main ?? '',
  'Subcategories': (b) => b.subs.map((s) => s.sub).join('; '),
  'Audience': (b) => b.audience,
  'Check': (b) => b.review.join('; '),
  'Title': (b) => b.copy.title,
  'Authors': (b) => (authorsByWork.get(b.copy.work_id) ?? []).join('; '),
  'Main category because': (b) => b.mainBecause ?? '',
  'Subcategories because': (b) => b.subs.map((s) => `${s.sub}: ${s.because}`).join('; '),
  'Audience because': (b) => b.audienceBecause ?? '',
  'Dewey': (b) => b.clues.dewey,
  'LC': (b) => b.clues.call,
  'LibraryThing genres': (b) => b.copy.lt_genres.join('; '),
  'Headings': (b) => b.clues.headings.join('; '),
}
const order = (b) => [MAIN_CATEGORIES.indexOf(b.main) + 1 || 99, b.copy.title]
const sorted = [...books].sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1].localeCompare(order(b)[1]))
const lines = [Object.keys(columns), ...sorted.map((b) => Object.values(columns).map((get) => get(b)))]
const folder = join(import.meta.dirname, '..', 'data', 'reports')
await mkdir(folder, { recursive: true })
const file = join(folder, `categories-${snapshot}.csv`)
await writeFile(file, '﻿' + lines.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
console.log(`\nEvery book, with the clue behind each category: ${file}`)
