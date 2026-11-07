// Manage › Export in the app: reads the library fresh and builds the same
// spreadsheet `npm run export` makes, as a file the phone can share or save.
// Loaded only when used, since the spreadsheet code is large.

import writeExcelFile from 'write-excel-file/browser'
import { bookSheet } from './bookSheet.js'
import { SHEET_OPTIONS, SHEET_TABLES, fetchTable, sheetFileName } from './tables.js'

// → { file, count }
export async function makeSpreadsheet(supabase, libraryId) {
  const tables = {}
  for (const table of SHEET_TABLES) tables[table.name] = await fetchTable(supabase, table, libraryId)
  const { sheetData, columns } = bookSheet(tables)
  const blob = await writeExcelFile(sheetData, { columns, ...SHEET_OPTIONS }).toBlob()
  const file = new File([blob], sheetFileName(), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  return { file, count: sheetData.length - 1 }
}
