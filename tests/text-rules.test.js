// The app's text rules: ISBNs, title cleanup, names, places, sorting, search, and
// categories. The repo is public, so examples are well-known books or made up,
// never the owner's catalog. These say how the rules work today; a test that
// fails after a change means a rule now gives a different answer, which may be
// the point of the change (then update the test) or a mistake.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { splitName } from '../src/addBook.js'
import { categorize } from '../src/categories/categorize.js'
import { isbn10To13, isbn13To10, readTypedIsbn, toIsbn, toIsbn10 } from '../src/isbn.js'
import { parsePlace } from '../src/shelfWalk.js'
import { cleanTitle, splitPublisherSeries } from '../src/titles/cleanTitle.js'
import { normalize, searchWords, titleSortKey } from '../src/useCatalog.js'
import { asOfText } from '../src/useSaved.js'

describe('ISBNs', () => {
  test('check digits catch a misread', () => {
    assert.equal(toIsbn('9780375705397'), '9780375705397')
    assert.equal(toIsbn('9780375705398'), null)
    assert.equal(toIsbn10('0375705392'), '0375705392')
    assert.equal(toIsbn10('0375705391'), null)
    assert.equal(toIsbn10('080442957X'), '080442957X')
  })
  test('only book barcodes (978 or 979) count as ISBN-13s', () => {
    assert.equal(toIsbn('0375705392'), null)
    assert.equal(toIsbn('0123456789012'), null)
  })
  test('converting between 10 and 13 digits', () => {
    assert.equal(isbn10To13('0375705392'), '9780375705397')
    assert.equal(isbn13To10('9780375705397'), '0375705392')
    assert.equal(isbn13To10('9791034731098'), null) // 979 ISBNs have no 10-digit form
  })
  test('a typed ISBN, with hyphens and spaces, of either length', () => {
    assert.deepEqual(readTypedIsbn(' 978-0-375-70539-7 '), { isbn: '9780375705397' })
    assert.deepEqual(readTypedIsbn('0-375-70539-2'), { isbn: '9780375705397' })
    assert.deepEqual(readTypedIsbn('12345'), { problem: 'An ISBN has 10 or 13 characters.' })
  })
})

describe('Title cleanup', () => {
  test('form labels are removed', () => {
    const clean = cleanTitle('Beloved: A Novel')
    assert.equal(clean.title, 'Beloved')
    assert.equal(clean.changed, true)
  })
  test('a series in brackets moves to the series field, with its number', () => {
    const clean = cleanTitle('The Lion, the Witch and the Wardrobe (Chronicles of Narnia, Book 2)')
    assert.equal(clean.title, 'The Lion, the Witch and the Wardrobe')
    assert.deepEqual(clean.series, ['The Chronicles of Narnia'])
    assert.equal(clean.number, '2')
  })
  test("a publisher's series moves to its own field", () => {
    const clean = cleanTitle('The Odyssey (Penguin Classics)')
    assert.equal(clean.title, 'The Odyssey')
    assert.deepEqual(clean.publisherSeries, ['Penguin Classics'])
  })
  test('an edition note moves to its own field', () => {
    const clean = cleanTitle('Ulysses: The Gabler Edition')
    assert.equal(clean.title, 'Ulysses')
    assert.deepEqual(clean.editionNotes, ['The Gabler Edition'])
  })
  test('a plain title is left alone', () => {
    assert.equal(cleanTitle('Gilead').changed, false)
  })
  test("a publisher's series number", () => {
    assert.deepEqual(splitPublisherSeries('Penguin Classics 12'), { name: 'Penguin Classics', number: '12' })
  })
})

describe('Splitting names into last and first', () => {
  const cases = {
    'Toni Morrison': { last: 'Morrison', first: 'Toni' },
    '  Toni   Morrison ': { last: 'Morrison', first: 'Toni' },
    'Morrison, Toni': { last: 'Morrison', first: 'Toni' },
    Homer: { last: 'Homer', first: '' },
    'Ursula K. Le Guin': { last: 'Le Guin', first: 'Ursula K.' },
    'Walter de la Mare': { last: 'de la Mare', first: 'Walter' },
    // A compound surname without a particle can't be told apart from a middle
    // name, which is why the check form prefers LC's "García Márquez, Gabriel".
    'Gabriel García Márquez': { last: 'Márquez', first: 'Gabriel García' },
  }
  for (const [name, parts] of Object.entries(cases)) test(name.trim(), () => assert.deepEqual(splitName(name), parts))
})

describe('Places on the shelf walk card', () => {
  test('city and state split at the last comma', () => {
    assert.deepEqual(parsePlace('Decorah, IA'), { city: 'Decorah', region: 'IA' })
    assert.deepEqual(parsePlace('St. Paul, MN'), { city: 'St. Paul', region: 'MN' })
    assert.deepEqual(parsePlace('Washington, D.C., USA'), { city: 'Washington, D.C.', region: 'USA' })
  })
  test('no comma means all city; blank means none', () => {
    assert.deepEqual(parsePlace('London'), { city: 'London', region: null })
    assert.deepEqual(parsePlace(''), { city: null, region: null })
  })
})

describe('Sorting by title', () => {
  test('leading articles are skipped, by the book’s language', () => {
    assert.equal(titleSortKey('The Hobbit', ['English']), 'hobbit')
    assert.equal(titleSortKey('A Wrinkle in Time', []), 'wrinkle in time') // no language means English
    assert.equal(titleSortKey('Die Verwandlung', ['German']), 'verwandlung')
    assert.equal(titleSortKey('Die Hard', ['English']), 'die hard')
    assert.equal(titleSortKey("L'Étranger", ['French']), 'etranger')
  })
  test('opening quotes and brackets are ignored', () => {
    assert.ok(titleSortKey('"The Raven"', ['English']).startsWith('raven'))
  })
})

describe('Search', () => {
  test('accents and special letters are ignored', () => {
    assert.equal(normalize('Pokémon Søren Æsop Straße'), 'pokemon soren aesop strasse')
  })
  test('punctuation splits words', () => {
    assert.deepEqual(searchWords('García -- Márquez, "Love"'), ['garcia', 'marquez', 'love'])
  })
})

describe('Category rules (main category, subcategories, audience)', () => {
  const book = (fields) => ({
    title: 'Untitled',
    original_title: null,
    dewey: null,
    lcc: null,
    lc_call_number: null,
    lc_subjects: [],
    subjects: [],
    lt_genres: [],
    ...fields,
  })
  const main = (fields) => categorize(book(fields)).main
  const subs = (fields) => categorize(book(fields)).subs.map((s) => s.sub)

  test('main category from Dewey', () => {
    assert.equal(main({ dewey: '813.54' }), 'Fiction')
    assert.equal(main({ dewey: '811.54' }), 'Poetry')
    assert.equal(main({ dewey: '822.33' }), 'Drama')
    assert.equal(main({ dewey: '973.7' }), 'Nonfiction')
    assert.equal(main({ dewey: '741.5973' }), 'Comics & Graphic Novels')
    assert.equal(main({ dewey: '398.2' }), 'Myth, Folklore & Fairy Tales')
  })
  test('Dewey quirks', () => {
    // 89x puts the form digit after the language: 895.63 is Japanese fiction.
    assert.equal(main({ dewey: '895.635' }), 'Fiction')
    assert.ok(subs({ dewey: '895.635' }).includes('In Translation'))
    // 092 within a subject marks a biography.
    assert.equal(main({ dewey: '973.7092' }), 'Biography & Memoir')
    // Prime marks are ignored.
    assert.equal(main({ dewey: "813/.54" }), 'Fiction')
  })
  test("every McSweeney's is Fiction › Short Stories & Anthologies, whatever its Dewey", () => {
    assert.equal(main({ title: "McSweeney's 73", dewey: '111.85' }), 'Fiction')
    assert.deepEqual(subs({ title: "McSweeney's 73", dewey: '111.85' }), ['Short Stories & Anthologies'])
  })
  test('fiction genre digits in Dewey', () => {
    assert.ok(subs({ dewey: '823.0872' }).includes('Mystery & Suspense'))
  })
  test('no clues means no main category (the review list catches it)', () => {
    assert.equal(main({}), null)
  })
  test('audience from headings', () => {
    assert.equal(categorize(book({ dewey: '813.54' })).audience, 'Adult')
    assert.equal(categorize(book({ dewey: '813.54', subjects: [['Dragons', 'Juvenile fiction']] })).audience, 'Kids')
    assert.equal(categorize(book({ dewey: '813.6', subjects: [['Young adult fiction']] })).audience, 'Teen')
  })
})

// Step 7a: when the saved copy of the library was last fresh.
describe('saved copy', () => {
  test('as of: the time today, the date and time before today', () => {
    const now = new Date(2026, 10, 9, 15, 0)
    const time = new Date(2026, 10, 9, 14, 15).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    assert.equal(asOfText(new Date(2026, 10, 9, 14, 15).toISOString(), now), time)
    assert.match(asOfText(new Date(2026, 10, 8, 14, 15).toISOString(), now), /8, /)
  })
})
