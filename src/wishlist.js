// The wishlist's rules, with no database here, so tests can use them.
// The wishlist is shared by the household and kept apart from the library: a
// wished-for book never counts in the totals.

import { plain, shortTitle } from './bookLookups.js'
import { today } from './dates.js'

// A wish is for the book in any edition (owner's choice, 2026-11-08). Another
// book matches it by the same ISBN, the same Open Library work, or the same
// short title (before any colon) with an author surname in common: the rule
// Scan uses for "You own another edition". No author means no title match.
const lastWord = (name) => plain(name).split(' ').at(-1)
const titleKey = (title) => (title ? plain(shortTitle(title)) : '')

function sameBook(wish, { isbns, workKey, titles, surnames }) {
  if (wish.isbn13 && isbns.includes(wish.isbn13)) return true
  if (wish.work_key && wish.work_key === workKey) return true
  const title = titleKey(wish.title)
  return Boolean(
    title &&
      titles.some((t) => titleKey(t) === title) &&
      wish.authors.some((a) => surnames.includes(lastWord(a))),
  )
}

// The wishes a looked-up book (Scan's preview, or Add by hand's pick) matches,
// the one for this exact edition first.
export function wishesForBook(wishes, book, isbn13) {
  if (!wishes || !book?.title) return []
  const found = {
    isbns: [isbn13].filter(Boolean),
    workKey: book.workKey ?? null,
    titles: [book.title],
    surnames: (book.authors ?? []).map(lastWord),
  }
  return wishes.filter((w) => sameBook(w, found)).sort((a, b) => (b.isbn13 === isbn13) - (a.isbn13 === isbn13))
}

// The copies in the library a wish matches ("You own this now").
export function copiesForWish(wish, copies) {
  if (!copies) return []
  return copies.filter((c) =>
    sameBook(wish, {
      isbns: [c.isbn13].filter(Boolean),
      workKey: null,
      titles: [c.title, c.original_title].filter(Boolean),
      // The surname is the part of "Morrison, Toni" before the comma, word by word.
      surnames: c.people.flatMap((p) => plain(p.author.sort_name.split(',')[0]).split(' ')),
    }),
  )
}

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

// Newest first; on the same day, the one added last first.
export const newestFirst = (wishes) =>
  [...wishes].sort((a, b) => b.added_on.localeCompare(a.added_on) || b.created_at.localeCompare(a.created_at))
