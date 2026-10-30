// Tries the weighted vote (src/categories/vote.js) on a backup and reports the
// result. Reads only the backup files: no sign-in, changes nothing.
//
//   npm run categories:vote                       (newest backup)
//   npm run categories:vote -- 2026-10-30_0909    (a particular one)
//
// Writes every book's votes to data/reports/ (kept out of GitHub) for checking.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, SNAPSHOT_NAME, csvCell } from './lib/catalog.mjs'
import { MAIN_CATEGORIES, SUBCATEGORY_RULES } from '../src/categories/category-rules.js'
import { ruleMatch } from '../src/categories/categorize.js'
import { SOURCE_NAMES, voteCategories } from '../src/categories/vote.js'

const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = process.argv[2] ?? snapshots.at(-1)
if (!snapshots.includes(snapshot)) throw new Error(`No backup named "${snapshot}". Backups: ${snapshots.join(', ') || 'none'}`)
const load = async (table) => JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${table}.json`), 'utf8'))
const [copies, lookups] = await Promise.all(['copies', 'lookups'].map(load))

const saved = new Map(lookups.filter((l) => l.found).map((l) => [`${l.source}|${l.isbn}`, l.data]))
const asked = new Set(lookups.map((l) => `${l.source}|${l.isbn}`))
const keyOf = (c) => c.isbn13 ?? c.isbn10 ?? `copy:${c.id}`

const books = copies.map((copy) => {
  const key = keyOf(copy)
  const answers = {
    locSearch: saved.get(`loc_search|${key}`),
    google: saved.get(`google|${key}`),
    openlibrary: saved.get(`openlibrary|${key}`),
  }
  const result = voteCategories(copy, answers)
  // LibraryThing is a check, not a voter: its genres that the vote didn't choose.
  const ltClues = { ...result.clues, genres: copy.lt_genres, dewey: '', lcClass: '', headings: [], title: '' }
  const ltSubs = (SUBCATEGORY_RULES[result.main] ?? []).filter((r) => ruleMatch(r, ltClues)).map((r) => r.sub)
  const ltMissed = ltSubs.filter((sub) => !result.subs.some((s) => s.sub === sub))
  return { copy, key, ...result, ltSubs, ltMissed }
})

const describe = (votes) => votes.map((v) => `${SOURCE_NAMES[v.source]} +${v.weight}: ${v.because}`).join(' | ')
const count = (test) => books.filter(test).length

console.log(`Backup ${snapshot}: ${books.length} books`)
console.log(`Answers in this backup: LC other editions ${count((b) => asked.has(`loc_search|${b.key}`))}, Google ${count((b) => asked.has(`google|${b.key}`))}\n`)
for (const main of MAIN_CATEGORIES) {
  const inMain = books.filter((b) => b.main === main)
  const rules = SUBCATEGORY_RULES[main]
  const line = rules ? `, ${inMain.filter((b) => !b.subs.length).length} with no subcategory` : ''
  console.log(`${main}: ${inMain.length}${line}`)
  if (rules) for (const { sub } of rules) console.log(`    ${String(inMain.filter((b) => b.subs.some((s) => s.sub === sub)).length).padStart(4)}  ${sub}`)
}
const audience = (a) => count((b) => b.audience === a)
console.log(`\nAudience: ${audience('Adult')} adult, ${audience('Teen')} teen, ${audience('Kids')} kids`)
console.log(`For review: ${count((b) => b.review.length)} books; sources disagree with the main category on ${count((b) => b.review.some((r) => r.startsWith('sources')))}`)
console.log(`LibraryThing genre not chosen by the vote: ${count((b) => b.ltMissed.length)} books (of ${count((b) => b.ltSubs.length)} with one)`)

const columns = {
  'Main category': (b) => b.main ?? '',
  'Subcategories': (b) => b.subs.map((s) => s.sub).join('; '),
  'Audience': (b) => b.audience,
  'Review': (b) => b.review.join('; '),
  'Title': (b) => b.copy.title,
  'Main because': (b) => b.mainBecause ?? '',
  'Subcategory votes': (b) => b.subs.map((s) => `${s.sub} (${s.score}): ${describe(s.votes)}`).join('; '),
  'Near misses': (b) => b.nearMisses.map((s) => `${s.sub} (${s.score}): ${describe(s.votes)}`).join('; '),
  'Audience votes': (b) => describe(b.audienceVotes),
  'LibraryThing not chosen': (b) => b.ltMissed.join('; '),
}
const rank = (b) => MAIN_CATEGORIES.indexOf(b.main) + 1 || 99
const sorted = [...books].sort((a, b) => rank(a) - rank(b) || a.copy.title.localeCompare(b.copy.title))
const lines = [Object.keys(columns), ...sorted.map((b) => Object.values(columns).map((get) => get(b)))]
const folder = join(import.meta.dirname, '..', 'data', 'reports')
await mkdir(folder, { recursive: true })
const file = join(folder, `votes-${snapshot}.csv`)
await writeFile(file, '﻿' + lines.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
console.log(`\nEvery book, with its votes: ${file}`)
