import { isbn13To10 } from './isbn.js'

// A copy filed under another edition's ISBN (LibraryThing's title search often
// picked the wrong one): the shelf walk scans the real ISBN, finds the copy as
// another edition of the same book, and on the owner's Yes turns the copy into
// the scanned edition.
//
// The edition's own details come from the scanned ISBN's lookup. One the lookup
// doesn't have is left blank, since the old value describes a book the owner
// doesn't have; binding and language are kept instead, as they're usually the
// same and lookups often skip them. The work (title, authors), categories,
// subjects, publisher's series, edition note, reading and acquired stay.

// The copy's changes, from `book` (lookUpNewBook's answer for `isbn13`).
export function editionChanges(copy, book, isbn13) {
  const pages = book.pages > 0 && book.pages < 100000 ? book.pages : null
  return {
    isbn13,
    isbn10: book.isbn10 ?? isbn13To10(isbn13),
    publisher: book.publisher ?? null,
    edition_year: book.year ?? null,
    pages,
    binding: book.binding ?? copy.binding ?? null,
    languages: book.languages?.length ? book.languages : (copy.languages ?? []),
    lc_call_number: book.catalog?.lc_call_number ?? null,
    cover_id: book.cover?.cover_id ?? null,
    cover_url: book.cover?.cover_url ?? null,
    cover_source: book.cover?.cover_source ?? null,
  }
}

// What the owner is shown before saving: each detail, now and after.
// Unchanged details are left out; a blank shows as "—".
export function changeRows(copy, changes) {
  const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))
  return [
    ['ISBN', copy.isbn13, changes.isbn13],
    ['Publisher', copy.publisher, changes.publisher],
    ['Year', copy.edition_year, changes.edition_year],
    ['Pages', copy.pages, changes.pages],
    ['Binding', copy.binding, changes.binding],
    ['Language', (copy.languages ?? []).join(', '), changes.languages.join(', ')],
  ]
    .filter(([, from, to]) => show(from) !== show(to))
    .map(([label, from, to]) => ({ label, from: show(from), to: show(to) }))
}
