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
