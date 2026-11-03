// The checks a form makes before saving, written once for every form. Each takes
// the typed text and returns what's wrong in plain words, or '' if it's fine.
// A form lists the checks it needs in order, and `firstProblem` gives the first.
import { toIsbn, toIsbn10 } from './isbn.js'

// The first problem in the list, or '' if there's none.
export const firstProblem = (...problems) => problems.find(Boolean) ?? ''

export const titleProblem = (title) => (title.trim() ? '' : 'A book needs a title.')

// `keep(i)` says whether row i must have a last name even when blank (Edit a Book:
// a person already on the book can't be emptied out).
export function peopleProblem(people, keep = () => false) {
  for (const [i, person] of people.entries()) {
    if (person.last.trim()) continue
    if (person.first.trim() || keep(i)) return 'Each person needs a last name (or a single name, like Homer).'
  }
  return ''
}

// Ancient works can have a year before 0, stored as a negative number.
export function firstPublishedProblem(text) {
  const year = text.trim()
  return year && !/^-?\d{1,4}$/.test(year) ? 'First published should be a year, like 1914.' : ''
}

export function pagesProblem(text) {
  const pages = text.trim()
  return pages && !/^[1-9]\d{0,4}$/.test(pages) ? 'Pages should be a whole number, like 224.' : ''
}

// Older records may hold odd values, so a value still as `saved` isn't checked.
export function editionYearProblem(text, saved) {
  const year = text.trim()
  if (!year || year === String(saved) || /^\d{4}$/.test(year)) return ''
  return 'Edition year should be a four-digit year, like 2008.'
}

// "0-375-70539-2" → "0375705392", as ISBNs are stored. Removes everything but
// letters and digits, since text pasted from a website can hide odd hyphens and
// invisible characters. A stray letter stays, so the check can catch it.
export const cleanIsbn = (value) => value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() || null

// Like the edition year, a value still as `saved` isn't checked.
export function isbnProblem(text, saved, length) {
  const isbn = cleanIsbn(text)
  if (!isbn || isbn === saved || (length === 13 ? toIsbn(isbn) : toIsbn10(isbn))) return ''
  return `That ISBN-${length} isn't valid. Check for a mistyped digit.`
}

export function seriesProblem(rows) {
  return rows.some((s) => s.number.trim() && !s.name.trim()) ? 'A series number needs a series name.' : ''
}

export function publisherSeriesProblem(rows) {
  return rows.some((s) => s.number.trim() && !s.name.trim()) ? "A publisher's series number needs a name." : ''
}

export function acquiredYearProblem(text) {
  const year = text.trim()
  if (year && (!/^\d{4}$/.test(year) || Number(year) > new Date().getFullYear())) {
    return 'Year acquired should be a four-digit year, not in the future.'
  }
  return ''
}
