// Saves the whole catalog as a spreadsheet (one row per book) to ~/Downloads, for
// Numbers, Excel or Google Sheets. Changes nothing in the library.
//
//   npm run export                 signs in and reads the library as it is now
//   npm run export -- --backup     reads the newest backup instead (no sign-in)
//
// The columns are in src/export/bookSheet.js and the tables in
// src/export/tables.js, shared with the app's Manage › Export.

import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import writeExcelFile from 'write-excel-file/node'
import { bookSheet } from '../src/export/bookSheet.js'
import { SHEET_OPTIONS, SHEET_TABLES as TABLES, sheetFileName } from '../src/export/tables.js'
import { BACKUP_ROOT, SNAPSHOT_NAME, fetchTable } from './lib/catalog.mjs'
import { signIn } from './lib/session.mjs'

const tables = {}
let madeFrom
if (process.argv.includes('--backup')) {
  const snapshots = (await readdir(BACKUP_ROOT)).filter((name) => SNAPSHOT_NAME.test(name)).sort()
  const snapshot = snapshots.at(-1)
  if (!snapshot) throw new Error(`No backups found in ${BACKUP_ROOT}`)
  // A backup made before a table existed has no file for it: that table was empty then.
  for (const { name } of TABLES) tables[name] = JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, `${name}.json`), 'utf8').catch(() => '[]'))
  madeFrom = `backup ${snapshot}`
} else {
  const { supabase, libraryId } = await signIn()
  for (const table of TABLES) tables[table.name] = await fetchTable(supabase, table, libraryId)
  madeFrom = 'the library as it is now'
}

const { sheetData, columns } = bookSheet(tables)
const file = join(homedir(), 'Downloads', sheetFileName())
await writeExcelFile(sheetData, { columns, ...SHEET_OPTIONS }).toFile(file)

console.log(`Saved ${sheetData.length - 1} books from ${madeFrom} to:\n  ${file}`)
