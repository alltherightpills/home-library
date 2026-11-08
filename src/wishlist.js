// The wishlist's rules, with no database here, so tests can use them.
// The wishlist is shared by the household and kept apart from the library: a
// wished-for book never counts in the totals.

import { today } from './dates.js'

// A note as saved: spaces tidied, blank as none.
export const tidyNote = (text) => text.trim().replace(/\s+/g, ' ') || null

// The row saved for a book Scan found (a `lookUpNewBook` preview) and its ISBN-13.
export function wishFromBook(book, isbn13, note, libraryId) {
  return {
    library_id: libraryId,
    title: [book.title, book.subtitle].map((t) => t?.trim().replace(/\s+/g, ' ')).filter(Boolean).join(': '),
    authors: book.authors,
    isbn13,
    work_key: book.workKey,
    cover_url: book.coverUrl,
    note: tidyNote(note),
    added_on: today(),
  }
}

// The wish for this exact edition, if there is one.
export const wishWithIsbn = (wishes, isbn13) => wishes?.find((w) => w.isbn13 === isbn13) ?? null

// Newest first; on the same day, the one added last first.
export const newestFirst = (wishes) =>
  [...wishes].sort((a, b) => b.added_on.localeCompare(a.added_on) || b.created_at.localeCompare(a.created_at))
