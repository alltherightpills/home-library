// Tries the title cleanup (src/titles/cleanTitle.js) on a backup and reports what
// would change. Reads only the backup files: no sign-in, changes nothing.
//
//   npm run titles:report                       (newest backup)
//   npm run titles:report -- 2026-10-30_1345    (a particular one)
//
// Writes two lists to data/reports/ (kept out of GitHub): every book, and every
// phrase removed or questioned, so a ruling can settle many books at once.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, SNAPSHOT_NAME, csvCell } from './lib/catalog.mjs'
import { cleanTitle } from '../src/titles/cleanTitle.js'

const snapshots = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort()
const snapshot = process.argv[2] ?? snapshots.at(-1)
if (!snapshots.includes(snapshot)) throw new Error(`No backup named "${snapshot}". Backups: ${snapshots.join(', ') || 'none'}`)
const copies = JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, 'copies.json'), 'utf8'))

const books = copies.map((copy) => ({ copy, ...cleanTitle(copy.title, copy.lt_record?.series ?? []) }))
const status = (b) => (b.checks.length ? 'Check' : b.changed ? 'Automatic' : 'No change')
const count = (name) => books.filter((b) => status(b) === name).length

console.log(`Backup ${snapshot}: ${books.length} books`)
console.log(`No change:  ${count('No change')}`)
console.log(`Automatic:  ${count('Automatic')}`)
console.log(`Check:      ${count('Check')}`)
console.log(`With a series: ${books.filter((b) => b.series.length).length}; with a publisher's series: ${books.filter((b) => b.publisherSeries.length).length}`)

const phrases = new Map()
for (const b of books) {
  for (const { text, kind, kept } of b.removed) {
    const key = `${kind}|${text.toLowerCase()}`
    const entry = phrases.get(key) ?? { text, kind, kept, count: 0, example: b.copy.title }
    entry.count++
    phrases.set(key, entry)
  }
}
const kinds = {}
for (const p of phrases.values()) kinds[p.kind] = (kinds[p.kind] ?? 0) + p.count
console.log('Pieces by kind:', kinds)

const toCsv = (rows) => '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
const order = { Check: 0, Automatic: 1, 'No change': 2 }
const sorted = [...books].sort((a, b) => order[status(a)] - order[status(b)] || a.copy.title.localeCompare(b.copy.title))
const bookRows = [
  ['Status', 'Current title', 'Proposed title', 'Series', 'Number', "Publisher's series", 'Edition note', 'Removed', 'To check'],
  ...sorted.map((b) => [
    status(b), b.copy.title, b.title, b.series.join('; '), b.number, b.publisherSeries.join('; '), b.editionNotes.join('; '),
    b.removed.filter((r) => !r.kept).map((r) => `${r.text} [${r.kind}]`).join('; '), b.checks.join('; '),
  ]),
]
const phraseRows = [
  ['Kind', 'Phrase', 'Books', 'Example'],
  ...[...phrases.values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count || a.text.localeCompare(b.text))
    .map((p) => [p.kind, p.text, p.count, p.example]),
]

const folder = join(import.meta.dirname, '..', 'data', 'reports')
await mkdir(folder, { recursive: true })
const bookFile = join(folder, `titles-${snapshot}.csv`)
const phraseFile = join(folder, `title-phrases-${snapshot}.csv`)
await writeFile(bookFile, toCsv(bookRows))
await writeFile(phraseFile, toCsv(phraseRows))
console.log(`\nEvery book: ${bookFile}\nEvery phrase: ${phraseFile}`)
