// Shared by backup.mjs and restore.mjs: where backups live, which tables they
// hold, reading a table in full, and the readable books.csv.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { creditsByWork as creditsByWorkFor, labelsByCopy } from '../../src/export/bookSheet.js'

export const BACKUP_ROOT = join(homedir(), 'Documents', 'Home Library Backups')
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}_\d{4}$/

// The book tables and how to read one live in src/ so the app's Manage › Export
// can use them too.
export { BOOK_TABLES, fetchTable } from '../../src/export/tables.js'

// Backed up for reference; a restore leaves these as they are.
export const LIBRARY_TABLES = [
  { name: 'libraries', libraryColumn: 'id', key: ['id'] },
  { name: 'library_members', key: ['user_id'] },
]


// Cover photos are stored as covers/<library id>/<file>; their web address has this in it.
export const PHOTO_PATH = '/storage/v1/object/public/covers/'

// ---------------------------------------------------------------------------
// books.csv: one row per book, in words a person can check at a glance (the
// fuller spreadsheet is `npm run export`, in src/export/bookSheet.js)
// ---------------------------------------------------------------------------

export function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function booksCsv({ works, authors, work_authors, copies, series, publisher_series, copy_series, copy_publisher_series }) {
  const workById = new Map(works.map((w) => [w.id, w]))
  const creditsByWork = creditsByWorkFor(authors, work_authors)
  const seriesByCopy = labelsByCopy(copy_series, series, 'series_id')
  const publisherSeriesByCopy = labelsByCopy(copy_publisher_series, publisher_series, 'publisher_series_id')

  const columns = {
    'Title': (c) => c.title,
    'Original title': (c) => c.original_title,
    'Series': (c) => (seriesByCopy.get(c.id) ?? []).join('; '),
    "Publisher's series": (c) => (publisherSeriesByCopy.get(c.id) ?? []).join('; '),
    'Edition note': (c) => c.edition_note,
    'Notes': (c) => c.notes,
    'Authors': (c) => (creditsByWork.get(c.work_id) ?? []).join('; '),
    'Publisher': (c) => c.publisher,
    'Edition year': (c) => c.edition_year,
    'First published': (c) => workById.get(c.work_id)?.first_published_year,
    'ISBN-13': (c) => c.isbn13,
    'ISBN-10': (c) => c.isbn10,
    'Pages': (c) => c.pages,
    'Binding': (c) => c.binding,
    'Languages': (c) => c.languages.join('; '),
    'LC call number': (c) => c.lc_call_number ?? c.lcc,
    'Dewey': (c) => c.dewey,
    'Subjects': (c) => c.subjects.map((parts) => parts.join(' -- ')).join('; '),
    'Date cataloged': (c) => c.added_on,
    'Cover source': (c) => c.cover_source,
    'Needs review': (c) => (c.needs_review ? 'yes' : ''),
    'Review note': (c) => c.review_note,
  }
  const rows = copies.map((copy) => Object.values(columns).map((get) => csvCell(get(copy))).join(','))
  // Sort by the whole line (so mostly by title), so books with the same title
  // come out in the same order however the rows were read.
  rows.sort((a, b) => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0))
  // The invisible mark at the start tells Excel the file is UTF-8, so accents survive.
  return '﻿' + [Object.keys(columns).map(csvCell).join(','), ...rows].join('\r\n') + '\r\n'
}
