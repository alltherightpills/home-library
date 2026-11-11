// New books' Location: Scan's "New books saved as" setting carries it, and
// office books (no bookplates) start with no year or place.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { acquiredText, formFromLookup } from '../src/addBook.js'

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
