// Manage › Places: the list of places, what a rename would do, and the map
// search's handling of the UK's nations. Made-up copies with well-known towns.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { exactText, placesIn, renamePlacePlan } from '../src/managePlaces.js'
import { lookupUrl } from '../src/placeMap.js'

const book = (id, city, region, country) => ({ id, acquired_city: city, acquired_region: region, acquired_country: country })
const copies = [
  book('c1', 'Springfield', 'IL', 'USA'),
  book('c2', 'Springfield', 'IL', 'USA'),
  book('c3', ' Springfield ', 'IL', null),
  book('c4', 'Springfeild', 'IL', 'USA'),
  book('c5', 'London', null, 'UK'),
  book('c6', null, null, null),
]
const places = placesIn(copies)
const find = (text) => places.find((p) => exactText(p.place) === text)

describe('the list of places', () => {
  test('each exact spelling is its own place, trimmed, A to Z', () => {
    assert.deepEqual(places.map((p) => exactText(p.place)), [
      'London, UK',
      'Springfeild, IL, USA',
      'Springfield, IL',
      'Springfield, IL, USA',
    ])
    assert.equal(find('Springfield, IL, USA').books.length, 2)
  })

  test('a book with no place is left out', () => {
    assert.ok(!places.some((p) => p.books.some((b) => b.id === 'c6')))
  })

  test('a place is matched by its trimmed text', () => {
    assert.ok(find('Springfield, IL').books.some((b) => b.id === 'c3'))
  })
})

describe('renaming a place', () => {
  const misspelled = find('Springfeild, IL, USA').place

  test('a new spelling, tidied', () => {
    const plan = renamePlacePlan(places, misspelled, { city: ' Springfield  ', region: 'MO', country: 'USA' })
    assert.deepEqual(plan.to, { city: 'Springfield', region: 'MO', country: 'USA' })
    assert.equal(plan.joins, null)
  })

  test("another place's exact text merges into it", () => {
    const plan = renamePlacePlan(places, misspelled, { city: 'Springfield', region: 'IL', country: 'USA' })
    assert.equal(plan.joins, find('Springfield, IL, USA'))
  })

  test('a blank country is its own spelling: filling it in merges', () => {
    const plan = renamePlacePlan(places, find('Springfield, IL').place, { city: 'Springfield', region: 'IL', country: 'USA' })
    assert.equal(plan.joins.books.length, 2)
  })

  test('no change, and a place with neither city nor state, are not saved', () => {
    assert.equal(renamePlacePlan(places, misspelled, { city: 'Springfeild', region: 'IL', country: 'USA' }).unchanged, true)
    assert.ok(renamePlacePlan(places, misspelled, { city: ' ', region: '', country: 'USA' }).problem)
  })
})

describe("the map search and the UK's nations", () => {
  const params = (place, limit) => new URL(lookupUrl(place, limit)).searchParams

  test('a nation typed as the country goes in the state box, with the UK as the country', () => {
    const p = params({ city: 'Edinburgh', region: null, country: 'Scotland' })
    assert.deepEqual([p.get('city'), p.get('state'), p.get('country')], ['Edinburgh', 'Scotland', 'United Kingdom'])
  })

  test('a county typed as the state stays the state', () => {
    const p = params({ city: 'Hay-on-Wye', region: 'Powys', country: 'wales' })
    assert.deepEqual([p.get('state'), p.get('country')], ['Powys', 'United Kingdom'])
  })

  test('other countries are unchanged, and Search again asks for several', () => {
    const p = params({ city: 'London', region: null, country: 'UK' }, 5)
    assert.deepEqual([p.get('state'), p.get('country'), p.get('limit')], [null, 'UK', '5'])
  })
})
