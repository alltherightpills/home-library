// The wishlist: the row saved for a scanned book, notes, and the order shown.
// Made-up books only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { copiesForWish, newestFirst, tidyNote, wishFromBook, wishesForBook } from '../src/wishlist.js'

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

  // Any edition: the same ISBN, the same Open Library work, or the same short
  // title with a surname in common.
  const salt = { title: 'The Salt Road: A Novel', authors: ['Ada Fenwick'], isbn13: '9780000000019', work_key: '/works/OL1W' }
  const kiln = { title: 'Kiln Hours', authors: ['Bo Marsh'], isbn13: '9780000000026', work_key: null }
  const wishes = [kiln, salt]

  test('a scanned book matches a wish by ISBN, work, or title and surname', () => {
    const scanned = (changes) => ({ title: 'Something Else', authors: ['Nobody'], workKey: null, ...changes })
    assert.deepEqual(wishesForBook(wishes, scanned({}), '9780000000019'), [salt], 'same ISBN')
    assert.deepEqual(wishesForBook(wishes, scanned({ workKey: '/works/OL1W' }), '9780000000099'), [salt], 'same work')
    assert.deepEqual(
      wishesForBook(wishes, scanned({ title: 'The salt road', authors: ['A. Fenwick'] }), '9780000000099'),
      [salt],
      'another edition by title and surname',
    )
    assert.deepEqual(wishesForBook(wishes, scanned({ title: 'The Salt Road' }), '9780000000099'), [], 'title alone is not enough')
    assert.deepEqual(wishesForBook(wishes, scanned({ authors: ['Ada Fenwick'] }), '9780000000099'), [], 'author alone is not enough')
    assert.deepEqual(wishesForBook(null, scanned({}), '9780000000019'), [], 'while loading')
  })

  test('this exact edition’s wish comes first', () => {
    const other = { ...salt, isbn13: '9780000000033', work_key: '/works/OL1W' }
    const found = wishesForBook([other, salt], { title: 'The Salt Road', authors: ['Ada Fenwick'], workKey: '/works/OL1W' }, '9780000000019')
    assert.deepEqual(found, [salt, other])
  })

  test('a wish matches copies already owned, in any edition', () => {
    const copy = (id, title, sortName, isbn13 = null) => ({ id, title, original_title: null, isbn13, people: [{ author: { sort_name: sortName } }] })
    const copies = [
      copy('a', 'The Salt Road', 'Fenwick, Ada'),
      copy('b', 'Kiln Hours', 'Someone, Else'),
      copy('c', 'Untitled', 'Marsh, Bo', '9780000000026'),
    ]
    assert.deepEqual(copiesForWish(salt, copies).map((c) => c.id), ['a'])
    assert.deepEqual(copiesForWish(kiln, copies).map((c) => c.id), ['c'], 'by ISBN; the same title by someone else is not it')
    assert.deepEqual(copiesForWish(salt, null), [], 'while loading')
  })

  // Add a book by title (slice C): no ISBN, so a later scan finds it by work or by title and surname.
  test('a wish added by title has no ISBN, and a scan of any edition still finds it', () => {
    const w = wishFromBook(book, null, '', 'lib-1')
    assert.equal(w.isbn13, null)
    const byTitle = { ...w, title: 'The Salt Road', work_key: null }
    const scanned = { title: 'The Salt Road', authors: ['Ada Fenwick'], workKey: '/works/OL1W' }
    assert.deepEqual(wishesForBook([w], scanned, '9780000000019'), [w], 'same work')
    assert.deepEqual(wishesForBook([byTitle], { ...scanned, workKey: null }, '9780000000019'), [byTitle], 'title and surname')
    assert.deepEqual(wishesForBook([w], { title: 'Kiln Hours', authors: ['Bo Marsh'], workKey: null }, '9780000000026'), [], 'another book')
  })

  test('surnames with two words, and accents', () => {
    const wish = { title: 'Cien años de soledad', authors: ['Gabriel García Márquez'], isbn13: null, work_key: null }
    const copies = [{ id: 'g', title: 'Cien Años de Soledad', original_title: null, isbn13: null, people: [{ author: { sort_name: 'García Márquez, Gabriel' } }] }]
    assert.deepEqual(copiesForWish(wish, copies).map((c) => c.id), ['g'])
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
