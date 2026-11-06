// The places map's rules: country names, circle sizes, names that fit, and
// the place search. Made-up places only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MIN_RADIUS, countryCode, lookupRow, lookupUrl, mapPlaces, needsLookup, placeLabels, radius } from '../src/placeMap.js'

describe('country names', () => {
  test('the usual ways of writing a country', () => {
    assert.equal(countryCode('USA'), 'USA')
    assert.equal(countryCode('UK'), 'GBR')
    assert.equal(countryCode('England'), 'GBR')
    assert.equal(countryCode(' canada '), 'CAN')
  })
  test('no country is the USA, like the shelf walk', () => assert.equal(countryCode(null), 'USA'))
  test("others by the map's own names", () => assert.equal(countryCode('Norway', { norway: 'NOR' }), 'NOR'))
  test('unknown names stay off the map', () => assert.equal(countryCode('Narnia'), null))
})

describe('places and lookups', () => {
  const at = (city, region, country) => ({ acquired_city: city, acquired_region: region, acquired_country: country })
  const copies = [at('Springfield', 'IL', 'USA'), at('Springfield', 'IL', 'USA'), at('Springfield', 'MO', 'USA'), at(null, null, null)]
  const places = mapPlaces(copies)
  test('one per place, most books first', () =>
    assert.deepEqual(
      places.map((p) => [p.city, p.region, p.count]),
      [
        ['Springfield', 'IL', 2],
        ['Springfield', 'MO', 1],
      ],
    ))
  test('saved places (found or not) are not looked up again', () =>
    assert.deepEqual(needsLookup(places, [{ city: 'Springfield', region: 'IL', country: 'USA', latitude: null }]), [places[1]]))
  test('the search keeps the state apart, spelled out', () => {
    const url = new URL(lookupUrl({ city: 'Springfield', region: 'MO', country: 'USA' }))
    assert.equal(url.searchParams.get('city'), 'Springfield')
    assert.equal(url.searchParams.get('state'), 'Missouri')
    assert.equal(url.searchParams.get('country'), 'USA')
  })
  test('a found place saves its coordinates and the name it matched', () => {
    const row = lookupRow(places[0], [{ lat: '39.8', lon: '-89.65', display_name: 'Springfield, Sangamon County, Illinois' }], 'lib')
    assert.deepEqual([row.latitude, row.longitude, row.found_as, row.library_id], [39.8, -89.65, 'Springfield, Sangamon County, Illinois', 'lib'])
  })
  test('nothing found saves blank coordinates, so it is not asked again', () => {
    const row = lookupRow(places[0], [], 'lib')
    assert.deepEqual([row.latitude, row.longitude, row.found_as], [null, null, null])
  })
})

describe('circles and names', () => {
  test("a circle's area follows the count", () => {
    const ratio = radius(100, 100) ** 2 / radius(25, 100) ** 2
    assert.ok(Math.abs(ratio - 4) < 1e-9)
  })
  test('never too small to see', () => assert.equal(radius(1, 1000), MIN_RADIUS))
  test("names don't overlap: the bigger place gets its name", () => {
    const big = { x: 100, y: 100, r: 20, name: 'Bigtown' }
    const near = { x: 104, y: 102, r: 5, name: 'Nearby' }
    const far = { x: 300, y: 250, r: 5, name: 'Faraway' }
    assert.deepEqual(
      placeLabels([near, big, far], 360, 300).map((c) => c.name),
      ['Bigtown', 'Faraway'],
    )
  })
  test('a name at the right edge goes to the left of its circle', () => {
    const [label] = placeLabels([{ x: 350, y: 100, r: 4, name: 'Edgeville' }], 360, 300)
    assert.equal(label.labelAnchor, 'end')
  })
})
