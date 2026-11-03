// What each form refuses to save, and the words it uses. Written before the three
// forms' checks were combined, so these prove the combining changed nothing.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { addProblem } from '../src/addBook.js'
import { formProblem } from '../src/bookEdits.js'
import { checkForm } from '../src/shelfWalk.js'

const nextYear = String(new Date().getFullYear() + 1)
const blankRow = { name: '', number: '' }

describe('Edit a Book (formProblem)', () => {
  const copy = { people: [{ author: { sort_name: 'Morrison, Toni' } }], edition_year: 87, isbn13: '9781400033416', isbn10: 'BAD' }
  const form = {
    title: 'Beloved',
    people: [{ last: 'Morrison', first: 'Toni', role: 'Author' }],
    firstPublished: '1987',
    pages: '324',
    editionYear: '87',
    isbn13: '978-1-4000-3341-6',
    isbn10: 'BAD',
    series: [blankRow],
    publisherSeries: [blankRow],
    acquiredYear: '2020',
  }
  const problem = (changes) => formProblem({ ...form, ...changes }, copy)

  test('a good form saves', () => assert.equal(problem({}), ''))
  test('title', () => assert.equal(problem({ title: '  ' }), 'A book needs a title.'))
  test('a person with only a first name', () => {
    assert.equal(problem({ people: [{ last: '', first: 'Toni', role: 'Author' }] }), 'Each person needs a last name (or a single name, like Homer).')
  })
  test('emptying an existing person', () => {
    assert.equal(problem({ people: [{ last: '', first: '', role: 'Author' }] }), 'Each person needs a last name (or a single name, like Homer).')
  })
  test('a new blank person row is ignored', () => {
    assert.equal(problem({ people: [...form.people, { last: '', first: '', role: 'Author' }] }), '')
  })
  test('first published', () => {
    assert.equal(problem({ firstPublished: '-750' }), '')
    assert.equal(problem({ firstPublished: '1987a' }), 'First published should be a year, like 1914.')
  })
  test('pages', () => {
    assert.equal(problem({ pages: '0' }), 'Pages should be a whole number, like 224.')
    assert.equal(problem({ pages: '12.5' }), 'Pages should be a whole number, like 224.')
  })
  test('edition year: an odd saved value is allowed, a changed one is checked', () => {
    assert.equal(problem({ editionYear: '87' }), '')
    assert.equal(problem({ editionYear: '988' }), 'Edition year should be a four-digit year, like 2008.')
  })
  test('ISBNs: an odd saved value is allowed, a changed one is checked', () => {
    assert.equal(problem({ isbn10: 'BAD' }), '')
    assert.equal(problem({ isbn13: '9781400033417' }), "That ISBN-13 isn't valid. Check for a mistyped digit.")
    assert.equal(problem({ isbn10: '0375705391' }), "That ISBN-10 isn't valid. Check for a mistyped digit.")
    assert.equal(problem({ isbn10: '0-375-70539-2' }), '')
  })
  test('series numbers need names', () => {
    assert.equal(problem({ series: [{ name: '', number: '3' }] }), 'A series number needs a series name.')
    assert.equal(problem({ publisherSeries: [{ name: '', number: '3' }] }), "A publisher's series number needs a name.")
  })
  test('year acquired', () => {
    assert.equal(problem({ acquiredYear: nextYear }), 'Year acquired should be a four-digit year, not in the future.')
    assert.equal(problem({ acquiredYear: '20' }), 'Year acquired should be a four-digit year, not in the future.')
  })
})

describe('Check and add (addProblem)', () => {
  const form = {
    title: 'Beloved',
    workId: '',
    people: [{ last: 'Morrison', first: 'Toni' }],
    firstPublished: '1987',
    editionYear: '2004',
    pages: '324',
    series: [blankRow],
    publisherSeries: [blankRow],
    acquiredYear: '2020',
  }
  const problem = (changes) => addProblem({ ...form, ...changes })

  test('a good form saves', () => assert.equal(problem({}), ''))
  test('title', () => assert.equal(problem({ title: '' }), 'A book needs a title.'))
  test('a person with only a first name', () => {
    assert.equal(problem({ people: [{ last: '', first: 'Toni' }] }), 'Each person needs a last name (or a single name, like Homer).')
  })
  test("joining another edition's work skips the names (they're hidden)", () => {
    assert.equal(problem({ workId: 'w1', people: [{ last: '', first: 'Toni' }] }), '')
  })
  test('first published, edition year, pages', () => {
    assert.equal(problem({ firstPublished: 'x' }), 'First published should be a year, like 1914.')
    assert.equal(problem({ editionYear: '87' }), 'Edition year should be a four-digit year, like 2008.')
    assert.equal(problem({ pages: '100000' }), 'Pages should be a whole number, like 224.')
  })
  test('series numbers need names', () => {
    assert.equal(problem({ series: [{ name: '', number: '3' }] }), 'A series number needs a series name.')
    // Since the checks were combined, the same words as Edit a Book.
    assert.equal(problem({ publisherSeries: [{ name: '', number: '3' }] }), "A publisher's series number needs a name.")
  })
  test('year acquired', () => {
    assert.equal(problem({ acquiredYear: nextYear }), 'Year acquired should be a four-digit year, not in the future.')
  })
})

describe('Shelf walk card (checkForm)', () => {
  test('a blank year means no bookplate', () => assert.equal(checkForm({ year: '', read: 'no' }, true), ''))
  test('year acquired', () => {
    assert.equal(checkForm({ year: nextYear, read: 'no' }, true), 'Year acquired should be a four-digit year, not in the future.')
  })
  test('Read? must be answered when asked', () => {
    assert.equal(checkForm({ year: '2020', read: null }, true), 'Answer Read: yes or no.')
    assert.equal(checkForm({ year: '2020', read: null }, false), '')
  })
})
