// New books' Location: Scan's "New books saved as" setting carries it, and
// office books (no bookplates) start with no year or place.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { acquiredText, formFromLookup } from '../src/addBook.js'
import { yearCounts } from '../src/acquired.js'
import { byFilters, byLocation, byRead, countText } from '../src/readings.js'

// Four books: read and unread at home, read and unread at the office.
const books = [
  { id: 1, read: true },
  { id: 2, read: false, location: 'Home' },
  { id: 3, read: true, location: 'Office' },
  { id: 4, read: false, location: 'Office' },
]
const ids = (list) => list.map((c) => c.id)

describe('location filters and counts', () => {
  test('Unread and Read leave office books out', () => {
    assert.deepEqual(ids(byRead(books, 'all')), [1, 2, 3, 4])
    assert.deepEqual(ids(byRead(books, 'read')), [1])
    assert.deepEqual(ids(byRead(books, 'unread')), [2])
  })

  test('the Location filter (no location means home)', () => {
    assert.deepEqual(ids(byLocation(books, 'all')), [1, 2, 3, 4])
    assert.deepEqual(ids(byLocation(books, 'home')), [1, 2])
    assert.deepEqual(ids(byLocation(books, 'office')), [3, 4])
    assert.deepEqual(ids(byFilters(books, 'unread', 'home')), [2])
  })

  test('the count names the filters', () => {
    assert.equal(countText(12), '12 books')
    assert.equal(countText(1, 'unread'), '1 unread book')
    assert.equal(countText(3, 'all', 'office'), '3 office books')
    assert.equal(countText(5, 'read', 'home'), '5 read home books')
  })

  test('office books are never "not walked yet"', () => {
    const counts = yearCounts([
      { acquired_year: 2001 },
      { shelf_walked_on: '2026-11-02' },
      { location: 'Home' },
      { location: 'Office' },
      { location: 'Office', acquired_year: 2020 },
    ])
    assert.deepEqual(counts.years.map((y) => y.year), ['2020', '2001'])
    assert.equal(counts.withYear, 2)
    assert.equal(counts.noYear, 1)
    assert.equal(counts.unwalked, 1)
  })
})

const home = { year: '2026', city: 'Springfield', region: 'IL', country: 'USA', location: 'Home' }
const office = { ...home, location: 'Office' }
const book = { title: 'Moby-Dick', authors: ['Herman Melville'], languages: ['English'] }
const start = (acquired) => formFromLookup(book, acquired, [], [], []).form

describe('location', () => {
  test('the setting line names the location', () => {
    assert.equal(acquiredText(home), 'Home · 2026 · Springfield, IL, USA')
    assert.equal(acquiredText(office), 'Office · no year or place')
  })

  test('a home book starts with the year and place', () => {
    const form = start(home)
    assert.equal(form.location, 'Home')
    assert.deepEqual([form.acquiredYear, form.city, form.region, form.country], ['2026', 'Springfield', 'IL', 'USA'])
  })

  test('an office book starts with no year or place', () => {
    const form = start(office)
    assert.equal(form.location, 'Office')
    assert.deepEqual([form.acquiredYear, form.city, form.region, form.country], ['', '', '', ''])
  })

  test('the shelf walk passes no location, so its books are at home', () => {
    const { location, ...walk } = home
    assert.equal(location, 'Home')
    assert.equal(start(walk).location, 'Home')
  })
})
