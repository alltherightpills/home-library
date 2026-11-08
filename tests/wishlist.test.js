// The wishlist: the row saved for a scanned book, notes, and the order shown.
// Made-up books only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { newestFirst, tidyNote, wishFromBook, wishWithIsbn } from '../src/wishlist.js'

const book = {
  title: 'The Salt  Road ',
  subtitle: 'A Novel',
  authors: ['Ada Fenwick'],
  workKey: '/works/OL1W',
  coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg',
}

describe('wishlist', () => {
  test('a scanned book becomes a wish with its subtitle, authors, work and cover', () => {
    const w = wishFromBook(book, '9780000000019', '  from   Sam ', 'lib-1')
    assert.equal(w.title, 'The Salt Road: A Novel')
    assert.deepEqual(w.authors, ['Ada Fenwick'])
    assert.equal(w.isbn13, '9780000000019')
    assert.equal(w.work_key, '/works/OL1W')
    assert.equal(w.cover_url, book.coverUrl)
    assert.equal(w.note, 'from Sam')
    assert.equal(w.library_id, 'lib-1')
    assert.match(w.added_on, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('no subtitle, blank note', () => {
    const w = wishFromBook({ ...book, subtitle: null }, '9780000000019', '   ', 'lib-1')
    assert.equal(w.title, 'The Salt Road')
    assert.equal(w.note, null)
    assert.equal(tidyNote(''), null)
  })

  test('finding the wish for an edition', () => {
    const wishes = [{ isbn13: '9780000000019' }, { isbn13: null }]
    assert.equal(wishWithIsbn(wishes, '9780000000019'), wishes[0])
    assert.equal(wishWithIsbn(wishes, '9780000000026'), null)
    assert.equal(wishWithIsbn(null, '9780000000019'), null, 'while loading')
  })

  test('newest first, and the later addition first on the same day', () => {
    const wishes = [
      { title: 'A', added_on: '2026-11-01', created_at: '2026-11-01T10:00:00Z' },
      { title: 'B', added_on: '2026-11-08', created_at: '2026-11-08T09:00:00Z' },
      { title: 'C', added_on: '2026-11-08', created_at: '2026-11-08T15:00:00Z' },
    ]
    assert.deepEqual(newestFirst(wishes).map((w) => w.title), ['C', 'B', 'A'])
  })
})
