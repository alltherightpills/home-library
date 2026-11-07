// The library's tables and how to read one whole, shared by the terminal
// scripts (backup, restore, export) and the app's Manage › Export. No file or
// Mac-only access here, so the phone can use it too.

// The book tables, parents before children. `key` names a row exactly within a
// library; reading in that order never skips a row. `primaryKey` is the
// database's own (what a restore matches rows on).
export const BOOK_TABLES = [
  { name: 'authors', key: ['id'], primaryKey: 'id' },
  // Pairs of people checked and found different (Manage › Authors › Possible duplicates).
  { name: 'authors_not_same', key: ['author_a', 'author_b'], primaryKey: 'author_a,author_b' },
  { name: 'works', key: ['id'], primaryKey: 'id' },
  { name: 'work_authors', key: ['work_id', 'author_id', 'role'], primaryKey: 'work_id,author_id,role' },
  { name: 'copies', key: ['id'], primaryKey: 'id' },
  { name: 'lookups', key: ['source', 'isbn'], primaryKey: 'library_id,source,isbn' },
  { name: 'categories', key: ['id'], primaryKey: 'id' },
  { name: 'book_categories', key: ['copy_id', 'category_id'], primaryKey: 'copy_id,category_id' },
  { name: 'series', key: ['id'], primaryKey: 'id' },
  { name: 'publisher_series', key: ['id'], primaryKey: 'id' },
  { name: 'copy_series', key: ['copy_id', 'series_id'], primaryKey: 'copy_id,series_id' },
  { name: 'copy_publisher_series', key: ['copy_id', 'publisher_series_id'], primaryKey: 'copy_id,publisher_series_id' },
  // Only the signed-in person's readings: the database shows nobody else's.
  { name: 'readings', key: ['id'], primaryKey: 'id' },
  // Map coordinates for the places books were acquired (the app looks them up).
  { name: 'places', key: ['id'], primaryKey: 'id' },
]

// What the spreadsheet needs: every book table except lookups (the saved
// answers from Open Library, LC and Google), readings, which the spreadsheet
// doesn't show yet, places (map coordinates; the sheet has each book's place),
// and authors_not_same (only for Possible duplicates).
export const SHEET_TABLES = BOOK_TABLES.filter((t) => !['lookups', 'readings', 'places', 'authors_not_same'].includes(t.name))

// Every row of one table in the library, 1,000 at a time (the most Supabase
// sends at once).
export async function fetchTable(supabase, { name, key, libraryColumn = 'library_id' }, libraryId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(name).select('*').eq(libraryColumn, libraryId)
    for (const column of key) query = query.order(column)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw new Error(`Reading ${name}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

// The spreadsheet's file name, by the device's own clock: "Home Library 2026-11-07.xlsx".
export const sheetFileName = (date = new Date()) => `Home Library ${date.toLocaleDateString('en-CA')}.xlsx`

// The spreadsheet's layout options, the same from the terminal and the app.
export const SHEET_OPTIONS = { sheet: 'Books', stickyRowsCount: 1, stickyColumnsCount: 1 }
