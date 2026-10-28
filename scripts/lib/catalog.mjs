// Shared by backup.mjs and restore.mjs: where backups live, which tables they
// hold, reading a table in full, and the readable books.csv.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const BACKUP_ROOT = join(homedir(), 'Documents', 'Home Library Backups')
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}_\d{4}$/

// The book tables, parents before children. `key` names a row exactly within a
// library; reading in that order never skips a row. `primaryKey` is the
// database's own (what a restore matches rows on).
export const BOOK_TABLES = [
  { name: 'authors', key: ['id'], primaryKey: 'id' },
  { name: 'works', key: ['id'], primaryKey: 'id' },
  { name: 'work_authors', key: ['work_id', 'author_id', 'role'], primaryKey: 'work_id,author_id,role' },
  { name: 'copies', key: ['id'], primaryKey: 'id' },
  { name: 'lookups', key: ['source', 'isbn'], primaryKey: 'library_id,source,isbn' },
]

// Backed up for reference; a restore leaves these as they are.
export const LIBRARY_TABLES = [
  { name: 'libraries', libraryColumn: 'id', key: ['id'] },
  { name: 'library_members', key: ['user_id'] },
]

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

// Cover photos are stored as covers/<library id>/<file>; their web address has this in it.
export const PHOTO_PATH = '/storage/v1/object/public/covers/'

// ---------------------------------------------------------------------------
// books.csv: one row per book, in words a person can check at a glance
// ---------------------------------------------------------------------------

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function booksCsv({ works, authors, work_authors, copies }) {
  const workById = new Map(works.map((w) => [w.id, w]))
  const authorById = new Map(authors.map((a) => [a.id, a]))
  const creditsByWork = new Map()
  for (const credit of [...work_authors].sort((a, b) => a.position - b.position)) {
    const name = authorById.get(credit.author_id)?.display_name ?? '?'
    const label = credit.role === 'Author' ? name : `${name} (${credit.role})`
    creditsByWork.set(credit.work_id, [...(creditsByWork.get(credit.work_id) ?? []), label])
  }

  const columns = {
    'Title': (c) => c.title,
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
