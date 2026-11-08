// Lending: matching a typed name to the borrowers list, a book's loans, and the
// words shown. Made-up people and books only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { borrowerNamed, borrowerNames, borrowerProblem, currentLoan, loanText, loansOf, tidyName } from '../src/lending.js'

const sam = { id: 'b1', name: 'Sam Rivera' }
const ana = { id: 'b2', name: 'ana' }
const borrowers = [sam, ana]

const loan = (id, copy_id, borrower_id, lent_on, returned_on = null, created_at = `${lent_on}T12:00:00Z`) => ({
  id,
  copy_id,
  borrower_id,
  lent_on,
  returned_on,
  created_at,
})

describe('typed names', () => {
  test('spaces are tidied as the database does', () => {
    assert.equal(tidyName('  Sam   Rivera '), 'Sam Rivera')
  })

  test('a name matches the list ignoring capitals and spaces', () => {
    assert.equal(borrowerNamed(borrowers, ' sam  rivera'), sam)
    assert.equal(borrowerNamed(borrowers, 'ANA'), ana)
  })

  test('a different or blank name matches nobody', () => {
    assert.equal(borrowerNamed(borrowers, 'Sam'), undefined)
    assert.equal(borrowerNamed(borrowers, '   '), undefined)
  })

  test('suggestions are A to Z, ignoring capitals', () => {
    assert.deepEqual(borrowerNames(borrowers), ['ana', 'Sam Rivera'])
  })

  test('a blank name is refused', () => {
    assert.ok(borrowerProblem('  '))
    assert.equal(borrowerProblem('Ana'), '')
  })
})

describe("a book's loans", () => {
  const loans = [
    loan('l1', 'c1', 'b1', '2026-03-01', '2026-04-10'),
    loan('l2', 'c1', 'b2', '2026-11-08'),
    loan('l3', 'c2', 'b1', '2026-06-15', '2026-07-01'),
  ]

  test('newest first, only that book', () => {
    assert.deepEqual(loansOf(loans, 'c1').map((l) => l.id), ['l2', 'l1'])
  })

  test('the loan not yet back is current', () => {
    assert.equal(currentLoan(loans, 'c1')?.id, 'l2')
    assert.equal(currentLoan(loans, 'c2'), undefined)
  })

  test('two loans on the same day: the later one first', () => {
    const sameDay = [loan('a', 'c3', 'b1', '2026-05-01', '2026-05-01', '2026-05-01T09:00:00Z'), loan('b', 'c3', 'b2', '2026-05-01', null, '2026-05-01T15:00:00Z')]
    assert.deepEqual(loansOf(sameDay, 'c3').map((l) => l.id), ['b', 'a'])
  })
})

describe('loan wording', () => {
  test('out', () => {
    const text = loanText(loan('l', 'c1', 'b1', '2026-11-08'), borrowers)
    assert.match(text, /^Lent to Sam Rivera since /)
    assert.match(text, /2026/)
  })

  test('back', () => {
    assert.match(loanText(loan('l', 'c1', 'b2', '2026-03-01', '2026-04-10'), borrowers), /^Lent to ana .+ · returned .+2026$/)
  })

  test('a name not loaded yet', () => {
    assert.match(loanText(loan('l', 'c1', 'zz', '2026-03-01'), borrowers), /^Lent to someone since /)
  })
})
