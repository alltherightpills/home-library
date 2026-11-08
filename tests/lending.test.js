// Lending: matching a typed name to the borrowers list, a book's loans, and the
// words shown. Made-up people and books only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  borrowerLoans,
  borrowerNamed,
  borrowerNames,
  borrowerProblem,
  borrowerRows,
  currentLoan,
  howLong,
  lentByPerson,
  lentOut,
  loanText,
  loansOf,
  renameProblem,
  tidyName,
} from '../src/lending.js'

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

describe('what’s out, and with whom', () => {
  const kim = { id: 'b3', name: 'Kim' }
  const people = [sam, ana, kim]
  const copies = ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id, title: id }))
  const loans = [
    loan('l1', 'c1', 'b1', '2026-10-01'),
    loan('l2', 'c2', 'b1', '2026-09-01'),
    loan('l3', 'c3', 'b2', '2026-08-01', '2026-08-20'),
    loan('l4', 'c4', 'b2', '2026-11-01'),
    loan('l5', 'gone', 'b3', '2026-11-02'), // a book removed since the app opened
  ]

  test('lentOut: only books not yet back, with the name', () => {
    const out = lentOut(loans, people)
    assert.deepEqual([...out.keys()].sort(), ['c1', 'c2', 'c4', 'gone'])
    assert.deepEqual(out.get('c1'), { name: 'Sam Rivera', lent_on: '2026-10-01' })
  })

  test('Lent out: by person A to Z, oldest loan first, removed books left out', () => {
    const groups = lentByPerson(loans, people, copies)
    assert.deepEqual(
      groups.map((g) => [g.borrower.name, g.books.map((b) => b.id)]),
      [
        ['ana', ['c4']],
        ['Sam Rivera', ['c2', 'c1']],
      ],
    )
    assert.equal(groups[1].books[0].loan.id, 'l2')
  })

  test('Borrowers list: books out now and loans in all', () => {
    assert.deepEqual(
      borrowerRows(people, loans).map((r) => [r.borrower.name, r.out, r.lent]),
      [
        ['ana', 1, 2],
        ['Kim', 1, 1],
        ['Sam Rivera', 2, 2],
      ],
    )
  })

  test('one person: out oldest first, returned newest first', () => {
    const more = [...loans, loan('l6', 'c1', 'b2', '2026-06-01', '2026-07-01')]
    const { out, back } = borrowerLoans(more, 'b2', copies)
    assert.deepEqual(out.map((b) => b.loan.id), ['l4'])
    assert.deepEqual(back.map((b) => b.loan.id), ['l3', 'l6'])
  })
})

describe('how long', () => {
  test('days, weeks, months, years', () => {
    assert.equal(howLong('2026-11-08', '2026-11-08'), 'today')
    assert.equal(howLong('2026-11-07', '2026-11-08'), '1 day')
    assert.equal(howLong('2026-10-26', '2026-11-08'), '13 days')
    assert.equal(howLong('2026-10-25', '2026-11-08'), '2 weeks')
    assert.equal(howLong('2026-09-01', '2026-11-08'), '2 months')
    assert.equal(howLong('2025-11-08', '2026-11-08'), '1 year')
  })

  test('across the clocks changing (Nov 1) it still counts whole days', () => {
    assert.equal(howLong('2026-10-31', '2026-11-02'), '2 days')
  })
})

describe('renaming a borrower', () => {
  test('a new name, or the same name with other capitals, is fine', () => {
    assert.equal(renameProblem(borrowers, sam, 'Sam R.'), '')
    assert.equal(renameProblem(borrowers, ana, 'Ana'), '')
  })

  test('someone else’s name or a blank is refused', () => {
    assert.match(renameProblem(borrowers, sam, ' ANA '), /already called ana/)
    assert.ok(renameProblem(borrowers, sam, '  '))
  })
})
