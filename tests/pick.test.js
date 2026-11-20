import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLANK_ANSWERS, isNew, matches, pickOrder, pickPool, readAuthorIds, surprising, whyText } from '../src/pick.js'

const categories = [
  { id: 'F', name: 'Fiction', parent_id: null, position: 1 },
  { id: 'FF', name: 'Fantasy', parent_id: 'F', position: 1 },
  { id: 'N', name: 'Nonfiction', parent_id: null, position: 2 },
  { id: 'NH', name: 'History', parent_id: 'N', position: 1 },
  { id: 'NR', name: 'Reference', parent_id: 'N', position: 2 },
]

let n = 0
function book({ work, shelves = [['F', true]], author = 'a1', ...fields } = {}) {
  n++
  return {
    id: `c${n}`,
    location: 'Home',
    audience: 'Adult',
    pages: 250,
    acquired_year: 2014,
    shelves: shelves.map(([category_id, is_main]) => ({ category_id, is_main, removed: false })),
    work: { id: work ?? `w${n}`, first_published_year: 1990, contributors: author ? [{ role: 'Author', author: { id: author } }] : [] },
    ...fields,
  }
}

const context = (copies, readings = []) => ({ categories, readAuthors: readAuthorIds(copies, readings), thisYear: 2026 })

test('the pool leaves out read, office, lent, being-read and reference books, one copy per work', () => {
  const unread = book()
  const read = book()
  const otherEditionOfRead = book({ work: read.work.id })
  const office = book({ location: 'Office' })
  const lent = book()
  const reading = book()
  const reference = book({ shelves: [['N', true], ['NR', false]] })
  const twin = book({ work: unread.work.id })
  const readings = [
    { copy_id: read.id, status: 'finished' },
    { copy_id: reading.id, status: 'reading' },
  ]
  const pool = pickPool([unread, read, otherEditionOfRead, office, lent, reading, reference, twin], {
    readings,
    lentTo: new Map([[lent.id, { name: 'Sam' }]]),
    categories,
  })
  assert.deepEqual(pool.map((c) => c.id), [unread.id])
})

test('a set-aside book is still in the pool', () => {
  const setAside = book()
  const pool = pickPool([setAside], { readings: [{ copy_id: setAside.id, status: 'set_aside' }], lentTo: new Map(), categories })
  assert.equal(pool.length, 1)
})

test('audience: only the chosen ones, and a book with none passes', () => {
  const kids = book({ audience: 'Kids' })
  const none = book({ audience: null })
  const ctx = context([kids, none])
  assert.equal(matches(kids, BLANK_ANSWERS, ctx), false)
  assert.equal(matches(kids, { ...BLANK_ANSWERS, audience: ['Adult', 'Kids'] }, ctx), true)
  assert.equal(matches(none, BLANK_ANSWERS, ctx), true)
})

test('kind: a main category takes its main-shelf and also-in books; a subcategory its shelf', () => {
  const fantasy = book({ shelves: [['F', true], ['FF', false]] })
  const history = book({ shelves: [['N', true], ['NH', false]] })
  const alsoFiction = book({ shelves: [['N', true], ['F', false]] })
  const ctx = context([fantasy, history, alsoFiction])
  const fiction = { ...BLANK_ANSWERS, main: 'F' }
  assert.equal(matches(fantasy, fiction, ctx), true)
  assert.equal(matches(alsoFiction, fiction, ctx), true)
  assert.equal(matches(history, fiction, ctx), false)
  assert.equal(matches(fantasy, { ...fiction, sub: 'FF' }, ctx), true)
  assert.equal(matches(alsoFiction, { ...fiction, sub: 'FF' }, ctx), false)
})

test('length, with a missing page count passing', () => {
  const short = book({ pages: 199 })
  const medium = book({ pages: 200 })
  const long = book({ pages: 400 })
  const unknown = book({ pages: null })
  const ctx = context([short, medium, long, unknown])
  const want = (length) => [short, medium, long, unknown].filter((c) => matches(c, { ...BLANK_ANSWERS, length }, ctx)).map((c) => c.pages)
  assert.deepEqual(want('short'), [199, null])
  assert.deepEqual(want('medium'), [200, null])
  assert.deepEqual(want('long'), [400, null])
})

test('new means the last 10 years, moving with the year', () => {
  assert.equal(isNew(2016, 2026), true)
  assert.equal(isNew(2015, 2026), false)
  assert.equal(isNew(2016, 2027), false)
  const recent = book({ work: 'recent' })
  recent.work.first_published_year = 2020
  const old = book()
  const unknown = book()
  unknown.work.first_published_year = null
  const ctx = context([recent, old, unknown])
  const want = (published) => [recent, old, unknown].filter((c) => matches(c, { ...BLANK_ANSWERS, published }, ctx))
  assert.deepEqual(want('new'), [recent, unknown])
  assert.deepEqual(want('old'), [old, unknown])
})

test('known or new author, from books read in any edition', () => {
  const readBook = book({ author: 'known' })
  const byKnown = book({ author: 'known' })
  const byNew = book({ author: 'stranger' })
  const noAuthor = book({ author: null })
  const ctx = context([readBook, byKnown, byNew, noAuthor], [{ copy_id: readBook.id, status: 'finished' }])
  const want = (author) => [byKnown, byNew, noAuthor].filter((c) => matches(c, { ...BLANK_ANSWERS, author }, ctx))
  assert.deepEqual(want('known'), [byKnown, noAuthor])
  assert.deepEqual(want('new'), [byNew, noAuthor])
})

test('with no author, editors stand in; introductions and translators do not', () => {
  const edited = (id, role = 'Editor') => {
    const b = book({ author: null })
    b.work.contributors = [{ role, author: { id } }]
    return b
  }
  const readAnthology = edited('penzler')
  const another = edited('penzler')
  const introOnly = edited('penzler', 'Introduction')
  const ctx = context([readAnthology, another, introOnly], [{ copy_id: readAnthology.id, status: 'finished' }])
  const known = { ...BLANK_ANSWERS, author: 'known' }
  assert.equal(matches(another, known, ctx), true)
  assert.equal(matches(another, { ...BLANK_ANSWERS, author: 'new' }, ctx), false)
  assert.equal(whyText(another, known, ctx), 'Fiction · edited by someone you’ve read · on your shelf since 2014')
  // An introduction alone credits nobody, so it's a missing answer.
  assert.equal(whyText(introOnly, known, ctx), 'Fiction · author unknown · on your shelf since 2014')
})

test('an anthology goes by its editor, not its contributors', () => {
  const readStory = book({ author: 'poe' })
  const anthology = book({ author: null })
  anthology.work.contributors = [
    { role: 'Editor', author: { id: 'ashley' } },
    { role: 'Contributor', author: { id: 'poe' } },
  ]
  const ctx = context([readStory, anthology], [{ copy_id: readStory.id, status: 'finished' }])
  assert.equal(matches(anthology, { ...BLANK_ANSWERS, author: 'known' }, ctx), false)
  assert.equal(matches(anthology, { ...BLANK_ANSWERS, author: 'new' }, ctx), true)
})

test('surprise me takes adult books only', () => {
  assert.equal(surprising(book()), true)
  assert.equal(surprising(book({ audience: 'Teen' })), false)
  assert.equal(surprising(book({ audience: null })), false)
})

test('longest waiting first: oldest year first, no year last', () => {
  const books = [book({ acquired_year: 2020 }), book({ acquired_year: null }), book({ acquired_year: 2005 })]
  const order = pickOrder(books, { waited: true, random: () => 0.5 })
  assert.deepEqual(order.map((b) => b.acquired_year), [2005, 2020, null])
})

test('random order uses every book once', () => {
  const books = [book(), book(), book(), book()]
  const values = [0.9, 0.1, 0.5, 0.3]
  const order = pickOrder(books, { random: () => values.shift() })
  assert.deepEqual(order, [books[1], books[3], books[2], books[0]])
})

test('why it was picked', () => {
  const readBook = book({ author: 'known' })
  const pick = book({ author: 'known', shelves: [['F', true], ['FF', false]], pages: 320 })
  const ctx = context([readBook, pick], [{ copy_id: readBook.id, status: 'finished' }])
  assert.equal(
    whyText(pick, { ...BLANK_ANSWERS, length: 'medium', author: 'known' }, ctx),
    'Fiction › Fantasy · 200–399 pages · by an author you’ve read · on your shelf since 2014',
  )
  assert.equal(whyText(pick, BLANK_ANSWERS, { ...ctx, surprise: true }), 'Surprise pick · Fiction › Fantasy · on your shelf since 2014')
  const kidsNoYear = book({ audience: 'Kids', acquired_year: null, pages: null })
  assert.equal(whyText(kidsNoYear, { ...BLANK_ANSWERS, length: 'short' }, ctx), 'Fiction · Kids · page count unknown')
  assert.equal(whyText(kidsNoYear, { ...BLANK_ANSWERS, waited: true }, ctx), 'Fiction · Kids · year acquired unknown')
})
