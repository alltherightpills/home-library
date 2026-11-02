// Saves the whole catalog as a spreadsheet (one row per book) to ~/Downloads, for
// Numbers, Excel or Google Sheets. Changes nothing in the library.
//
//   npm run export                 signs in and reads the library as it is now
//   npm run export -- --backup     reads the newest backup instead (no sign-in)
//
// The columns are in src/export/bookSheet.js, so the app's Manage screen can
// offer the same export later.

import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import writeExcelFile from 'write-excel-file/node'
import { bookSheet } from '../src/export/bookSheet.js'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, fetchTable } from './lib/catalog.mjs'
import { signIn } from './lib/session.mjs'

// Every book table except lookups (the saved answers from Open Library, LC and
// Google) and readings, which the spreadsheet doesn't show yet.
const TABLES = BOOK_TABLES.filter((t) => !['lookups', 'readings'].includes(t.name))

const tables = {}
let madeFrom
if (process.argv.includes('--backup')) {
  const snapshots = (await readdir(BACKUP_ROOT)).filter((name) => SNAPSHOT_NAME.test(name)).sort()
  const snapshot = snapshots.at(-1)
  if (!snapshot) throw new Error(`No backups found in ${BACKUP_ROOT}`)
  for (const { name } of TABLES) tables[name] = JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${name}.json`), 'utf8'))
  madeFrom = `backup ${snapshot}`
} else {
  const { supabase, libraryId } = await signIn()
  for (const table of TABLES) tables[table.name] = await fetchTable(supabase, table, libraryId)
  madeFrom = 'the library as it is now'
}

const { sheetData, columns } = bookSheet(tables)
const today = new Date().toLocaleDateString('en-CA') // 2026-11-02, by the Mac's clock
const file = join(homedir(), 'Downloads', `Home Library ${today}.xlsx`)
await writeExcelFile(sheetData, { columns, sheet: 'Books', stickyRowsCount: 1, stickyColumnsCount: 1 }).toFile(file)

console.log(`Saved ${sheetData.length - 1} books from ${madeFrom} to:\n  ${file}`)
