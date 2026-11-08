// Lending rules (Phase 2 step 5): who has a book, its loan history, and the
// words shown for each. No database here, so tests can use it; the saves are in
// useLoans.js. A loan is { id, copy_id, borrower_id, lent_on, returned_on }.
import { dateText } from './dates.js'

// A name as saved: outer spaces off and runs of spaces made one, as the
// database's lend_copy does.
export const tidyName = (text) => text.trim().replace(/\s+/g, ' ')

// The borrower on the list with this name, ignoring capitals and spacing.
export function borrowerNamed(borrowers, text) {
  const wanted = tidyName(text).toLowerCase()
  return wanted ? borrowers.find((b) => b.name.toLowerCase() === wanted) : undefined
}

// Names to suggest while typing, A to Z.
export const borrowerNames = (borrowers) =>
  borrowers.map((b) => b.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

// One book's loans, newest first.
export const loansOf = (loans, copyId) =>
  loans.filter((l) => l.copy_id === copyId).sort((a, b) => b.lent_on.localeCompare(a.lent_on) || b.created_at.localeCompare(a.created_at))

// The book's loan that hasn't come back, if it's out.
export const currentLoan = (loans, copyId) => loans.find((l) => l.copy_id === copyId && !l.returned_on)

// One line about a loan: "Lent to Sam since Nov 8, 2026", or once back,
// "Lent to Sam Nov 8, 2026 · returned Dec 1, 2026".
export function loanText(loan, borrowers) {
  const name = borrowers.find((b) => b.id === loan.borrower_id)?.name ?? 'someone'
  if (!loan.returned_on) return `Lent to ${name} since ${dateText(loan.lent_on)}`
  return `Lent to ${name} ${dateText(loan.lent_on)} · returned ${dateText(loan.returned_on)}`
}

// What's wrong with the name typed in Lend it out, or ''.
export const borrowerProblem = (text) => (tidyName(text) ? '' : 'Type who you’re lending it to.')

// copy id → { name, lent_on } for every book out now (the lists' "Lent to"
// mark, Scan, and the spreadsheet).
export function lentOut(loans, borrowers) {
  const nameOf = new Map(borrowers.map((b) => [b.id, b.name]))
  return new Map(loans.filter((l) => !l.returned_on).map((l) => [l.copy_id, { name: nameOf.get(l.borrower_id) ?? 'someone', lent_on: l.lent_on }]))
}

// How long from one stored date to another, roughly: "today", "3 days",
// "2 weeks", "5 months", "1 year".
export function howLong(from, to) {
  const days = Math.round((Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86_400_000)
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (days <= 0) return 'today'
  if (days < 14) return unit(days, 'day')
  if (days < 61) return unit(Math.floor(days / 7), 'week')
  if (days < 365) return unit(Math.floor(days / 30.44), 'month')
  return unit(Math.max(1, Math.floor(days / 365.25)), 'year')
}

// The Lent out screen: [{ borrower, books }] A to Z by name, each person's
// books out now oldest loan first, each book with its `loan`. A loan whose
// book was removed since the app opened is left out.
export function lentByPerson(loans, borrowers, copies) {
  const copyById = new Map(copies.map((c) => [c.id, c]))
  return borrowerNames(borrowers)
    .map((name) => borrowers.find((b) => b.name === name))
    .map((borrower) => ({
      borrower,
      books: loans
        .filter((l) => l.borrower_id === borrower.id && !l.returned_on && copyById.has(l.copy_id))
        .sort((a, b) => a.lent_on.localeCompare(b.lent_on))
        .map((loan) => ({ ...copyById.get(loan.copy_id), loan })),
    }))
    .filter((p) => p.books.length)
}

// Manage › Borrowers: [{ borrower, out, lent }] A to Z, with how many books
// they have now and how many loans in all.
export const borrowerRows = (borrowers, loans) =>
  borrowerNames(borrowers)
    .map((name) => borrowers.find((b) => b.name === name))
    .map((borrower) => {
      const theirs = loans.filter((l) => l.borrower_id === borrower.id)
      return { borrower, out: theirs.filter((l) => !l.returned_on).length, lent: theirs.length }
    })

// One person's loans as books, each with its `loan`: { out } (oldest first)
// and { back } (newest first).
export function borrowerLoans(loans, borrowerId, copies) {
  const copyById = new Map(copies.map((c) => [c.id, c]))
  const theirs = loans
    .filter((l) => l.borrower_id === borrowerId && copyById.has(l.copy_id))
    .map((loan) => ({ ...copyById.get(loan.copy_id), loan }))
  return {
    out: theirs.filter((b) => !b.loan.returned_on).sort((a, b) => a.loan.lent_on.localeCompare(b.loan.lent_on)),
    back: theirs.filter((b) => b.loan.returned_on).sort((a, b) => b.loan.returned_on.localeCompare(a.loan.returned_on)),
  }
}

// What's wrong with renaming `borrower` to `text`, or ''. Changing only
// capitals is fine; taking someone else's name isn't.
export function renameProblem(borrowers, borrower, text) {
  if (!tidyName(text)) return 'Type a name.'
  const other = borrowerNamed(borrowers, text)
  return other && other.id !== borrower.id ? `Someone on your list is already called ${other.name}.` : ''
}
