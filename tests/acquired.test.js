// The year and place counts on the dashboard and the Acquired screen.
// Made-up copies: only the acquisition fields matter here.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { booksAcquiredIn, booksFrom, placeTitle, placeTree, regionName, topPlaces, yearCounts } from '../src/acquired.js'

const book = (year, city, region, country, walked = '2026-11-01') => ({
  acquired_year: year,
  acquired_city: city,
  acquired_region: region,
  acquired_country: country,
  shelf_walked_on: walked,
})

const copies = [
  book(2021, 'Springfield', 'IL', 'USA'),
  book(2021, 'Springfield', 'IL', 'USA'),
  book(2019, 'Chicago', 'IL', 'USA'),
  book('2019', 'Springfield', 'MO', 'USA'),
  book(2024, 'London', null, 'UK'),
  book(2024, '  Springfield ', 'IL', 'USA'), // stray spaces count as the same place
  book(null, null, null, null), // walked, no bookplate
  book(null, null, null, null, null), // not walked yet
]

describe('years', () => {
  const { years, withYear, noYear, unwalked } = yearCounts(copies)
  test('newest first, number or text alike', () =>
    assert.deepEqual(years, [
      { year: '2024', count: 2 },
      { year: '2021', count: 2 },
      { year: '2019', count: 2 },
    ]))
  test('blanks are counted, not hidden', () => assert.deepEqual([withYear, noYear, unwalked], [6, 1, 1]))
  test('the counts add up to the library', () => assert.equal(withYear + noYear + unwalked, copies.length))
  test('a year opens its books', () => assert.equal(booksAcquiredIn(copies, '2019').length, 2))
  test('no bookplate means walked with no year', () => assert.equal(booksAcquiredIn(copies, 'none').length, 1))
})

describe('places', () => {
  const tree = placeTree(copies)
  test('countries, most books first', () =>
    assert.deepEqual(
      tree.map((c) => [c.name, c.count]),
      [
        ['USA', 5],
        ['UK', 1],
      ],
    ))
  test('states roll up their cities', () => {
    const [illinois, missouri] = tree[0].regions
    assert.deepEqual([illinois.name, illinois.count, missouri.name, missouri.count], ['IL', 4, 'MO', 1])
    assert.deepEqual(illinois.cities, [
      { name: 'Springfield', count: 3 },
      { name: 'Chicago', count: 1 },
    ])
  })
  test('a country with no states keeps its cities under one blank state', () =>
    assert.deepEqual(tree[1].regions, [{ name: null, count: 1, cities: [{ name: 'London', count: 1 }] }]))
  test('same city name in two states stays apart', () =>
    assert.deepEqual(topPlaces(copies, 3), [
      { name: 'Springfield, IL', count: 3 },
      { name: 'Chicago, IL', count: 1 },
      { name: 'London', count: 1 },
    ]))
  test('a row opens the books at its level', () => {
    assert.equal(booksFrom(copies, { country: 'USA' }).length, 5)
    assert.equal(booksFrom(copies, { country: 'USA', region: 'IL' }).length, 4)
    assert.equal(booksFrom(copies, { country: 'USA', region: 'IL', city: 'Springfield' }).length, 3)
    assert.equal(booksFrom(copies, { country: 'UK', region: null, city: 'London' }).length, 1)
  })
})

describe('names', () => {
  test('US state codes spelled out', () => assert.equal(regionName('wi', 'USA'), 'Wisconsin'))
  test('other regions as typed', () => assert.equal(regionName('Ontario', 'Canada'), 'Ontario'))
  test('city headings', () => {
    assert.equal(placeTitle({ country: 'USA', region: 'IA', city: 'Decorah' }), 'Decorah, Iowa')
    assert.equal(placeTitle({ country: 'UK', region: null, city: 'London' }), 'London, UK')
  })
  test('state and country headings', () => {
    assert.equal(placeTitle({ country: 'USA', region: 'WI' }), 'Wisconsin, USA')
    assert.equal(placeTitle({ country: 'USA' }), 'USA')
  })
})
