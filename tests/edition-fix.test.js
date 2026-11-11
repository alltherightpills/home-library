// Turning a copy into the edition the shelf walk scanned. Made-up ISBNs and books.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { changeRows, editionChanges } from '../src/editionFix.js'

describe('edition fix', () => {
  const copy = {
    isbn13: '9780000000019',
    isbn10: '0000000019',
    publisher: 'Old Press',
    edition_year: 2016,
    pages: 336,
    binding: 'Paperback',
    languages: ['English'],
    lc_call_number: 'PR0000 .A1 2016',
    cover_id: 123,
    cover_url: null,
    cover_source: 'openlibrary_edition',
  }

  test('takes the scanned edition’s details', () => {
    const book = {
      isbn10: '0000000027',
      publisher: 'New Press',
      year: 1959,
      pages: 192,
      binding: 'Hardcover',
      languages: ['English'],
      catalog: { lc_call_number: 'PR0000 .A1 1959' },
      cover: { cover_id: 456, cover_source: 'openlibrary_edition' },
    }
    assert.deepEqual(editionChanges(copy, book, '9780000000026'), {
      isbn13: '9780000000026',
      isbn10: '0000000027',
      publisher: 'New Press',
      edition_year: 1959,
      pages: 192,
      binding: 'Hardcover',
      languages: ['English'],
      lc_call_number: 'PR0000 .A1 1959',
      cover_id: 456,
      cover_url: null,
      cover_source: 'openlibrary_edition',
    })
  })

  test('blanks what the lookup lacks, but keeps binding and language', () => {
    const changes = editionChanges(copy, { pages: 0, languages: [], catalog: {}, cover: null }, '9780000000026')
    assert.equal(changes.isbn10, '0000000027', 'worked out from the ISBN-13')
    assert.equal(changes.publisher, null)
    assert.equal(changes.edition_year, null)
    assert.equal(changes.pages, null, 'an odd page count is left out')
    assert.equal(changes.lc_call_number, null)
    assert.equal(changes.cover_id, null)
    assert.equal(changes.cover_source, null)
    assert.equal(changes.binding, 'Paperback')
    assert.deepEqual(changes.languages, ['English'])
  })

  test('a Google cover comes as a link', () => {
    const book = { cover: { cover_url: 'https://books.google.com/x', cover_source: 'google' } }
    const changes = editionChanges(copy, book, '9780000000026')
    assert.equal(changes.cover_id, null)
    assert.equal(changes.cover_url, 'https://books.google.com/x')
  })

  test('shows only what changes, blanks as a dash', () => {
    const changes = editionChanges(copy, { publisher: 'Old Press', year: 1959, binding: 'Paperback' }, '9780000000026')
    assert.deepEqual(
      changeRows(copy, changes).map((r) => `${r.label}: ${r.from} → ${r.to}`),
      ['ISBN: 9780000000019 → 9780000000026', 'Year: 2016 → 1959', 'Pages: 336 → —'],
    )
  })
})
