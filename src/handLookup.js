// Add by hand: searching by title, author and year, and turning the pick into a
// book for the check form, in the same shape as a scanned book (makePreview in
// scanLookup.js), so the form, the vote and saving work the same way.
import { splitName } from './addBook.js'
import { lookUpGoogle, plain, searchOpenLibrary, shortTitle } from './bookLookups.js'
import { fetchGoogleJson } from './googleBooks.js'
import { locCallNumber, locDewey, locEdition, locSubjects, lookUpLocByTitle } from './locLookups.js'
import { LANGUAGES, askLoc, betterCase, fetchText, firstPublished, sameWorkIsbns } from './scanLookup.js'

const NO_CATALOG = { lc_subjects: [], lc_call_number: null, dewey: null, lcc: null }
const coverOf = (doc) => (doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null)

// Asks LC (its editions, and those of the typed year), Open Library (its works)
// and Google (its best match, for the vote) all at once.
// -> { editions, yearMatched, works, answers, unreachable, saved }
export async function searchByHand({ title, author, year }) {
  const surname = author ? splitName(author).last : ''
  const unreachable = new Set()
  // A source's answer, null if it found nothing, or undefined if it couldn't be reached.
  const ask = async (name, look) => {
    try {
      return await look()
    } catch {
      unreachable.add(name)
      return undefined
    }
  }
  const [ofYear, locSearch, works, google] = await Promise.all([
    year ? ask('Library of Congress', () => lookUpLocByTitle(title, surname, askLoc, { year })) : null,
    ask('Library of Congress', () => lookUpLocByTitle(title, surname, askLoc)),
    ask('Open Library', () => searchOpenLibrary(title, author, fetchText)),
    ask('Google Books', () => lookUpGoogle({ title, author, surname, isbns: [] }, fetchGoogleJson)),
  ])
  // With no edition from that year, the other years' editions are shown instead.
  const yearMatched = Boolean(ofYear?.records.length)
  const records = yearMatched ? ofYear.records : (locSearch?.records ?? [])
  return {
    editions: records.map((record) => ({ record, ...locEdition(record) })),
    yearMatched,
    works: (works ?? []).map((doc) => ({ doc, coverUrl: coverOf(doc) })),
    // What the vote reads; Open Library's work is added once one is picked.
    answers: { locSearch: locSearch ?? null, google: google ?? null },
    unreachable: [...unreachable],
    // Saved in `lookups` with the book, as `npm run enrich -- --votes` would.
    // An answer that couldn't be fetched isn't saved, so the script can try again.
    saved: { ...(locSearch !== undefined && { loc_search: locSearch }), ...(google !== undefined && { google }) },
  }
}

// The Open Library work that's the same book as an LC edition: the same short
// title, and an author in common when both name one.
function sameWork(works, edition) {
  const title = plain(shortTitle(edition.title))
  const surnames = edition.authorSortNames.map((n) => plain(n.split(',')[0]))
  return works.find(({ doc }) => {
    if (plain(shortTitle(doc.title)) !== title) return false
    const theirs = (doc.author_name ?? []).map(plain)
    return !surnames.length || !theirs.length || theirs.some((name) => surnames.some((s) => name.includes(s)))
  })?.doc ?? null
}

const blankBook = (search) => ({
  found: true,
  title: '',
  subtitle: null,
  authors: [],
  publisher: null,
  year: null,
  pages: null,
  binding: null,
  languages: [],
  isbn10: null,
  editionNote: null,
  firstPublished: null,
  firstPublishedSource: null,
  cover: null,
  coverUrl: null,
  catalog: NO_CATALOG,
  workKey: null,
  sameWorkIsbns: [],
  sources: [],
  unreachable: search.unreachable,
  answers: { ...search.answers, openlibrary: null },
  lookupsToSave: search.saved,
})

// The book for the check form, from the pick: { edition } from LC, { work }
// from Open Library, or nothing ("None of these") with the typed title and author.
export async function bookFromPick(search, typed, { edition, work } = {}) {
  const book = blankBook(search)
  const doc = work ?? (edition && sameWork(search.works, edition))
  if (doc) {
    Object.assign(book, {
      cover: doc.cover_i ? { cover_id: doc.cover_i, cover_source: 'openlibrary_work' } : null,
      coverUrl: coverOf(doc),
      workKey: doc.key,
      sameWorkIsbns: await sameWorkIsbns(doc.key),
      answers: { ...book.answers, openlibrary: doc },
      lookupsToSave: { ...book.lookupsToSave, openlibrary: doc },
    })
  }

  if (edition) {
    const first = firstPublished(doc, edition.record, edition.year)
    return Object.assign(book, {
      // LC writes titles in library style ("The wind in the willows"); take Open Library's capitals.
      title: betterCase(edition.title, doc?.title),
      subtitle: edition.subtitle,
      authors: edition.authors,
      authorSortNames: edition.authorSortNames,
      publisher: edition.publisher,
      year: edition.year,
      pages: edition.pages,
      languages: LANGUAGES[edition.languageCode] ? [LANGUAGES[edition.languageCode]] : [],
      editionNote: edition.edition,
      firstPublished: first.year,
      firstPublishedSource: first.source,
      catalog: { ...NO_CATALOG, lc_subjects: locSubjects(edition.record), lc_call_number: locCallNumber(edition.record), dewey: locDewey(edition.record) },
      sources: ['Library of Congress', doc && 'Open Library'].filter(Boolean),
    })
  }
  if (work) {
    return Object.assign(book, {
      title: work.title,
      authors: work.author_name ?? [],
      firstPublished: work.first_publish_year ?? null,
      firstPublishedSource: work.first_publish_year ? 'Open Library' : null,
      sources: ['Open Library'],
    })
  }
  return Object.assign(book, {
    title: typed.title.trim(),
    authors: typed.author.trim() ? [typed.author.trim()] : [],
    year: Number(typed.year) || null,
  })
}
