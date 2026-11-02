// Scan to add: looking up a book you don't own, and finding other editions you do.
import { lookUpGoogle, lookUpOpenLibrary, lookUpOpenLibraryEdition, plain, shortTitle } from './bookLookups.js'
import { fetchGoogleJson, tidyImage } from './googleBooks.js'
import { isbn13To10 } from './isbn.js'
import { supabase } from './supabase.js'

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const SOURCES = ['openlibrary', 'openlibrary_edition', 'google']
const SOURCE_NAMES = { openlibrary: 'Open Library', openlibrary_edition: 'Open Library', google: 'Google Books' }

// Looks up a new ISBN-13 in Open Library, then Google (which needs the title
// Open Library gives). Answers already saved in `lookups` are used instead of
// asking again; new ones are saved, as `npm run enrich` does, so adding the
// book and the category vote won't need to ask again either.
// Throws only when no source could be reached at all.
export async function lookUpNewBook(isbn13, libraryId) {
  const isbn10 = isbn13To10(isbn13)
  const keys = [isbn13, isbn10].filter(Boolean)

  // What's already saved, preferring answers filed under the ISBN-13.
  const { data: saved, error } = await supabase
    .from('lookups')
    .select('source, isbn, found, data')
    .in('source', SOURCES)
    .in('isbn', keys)
  if (error) throw new Error(error.message)
  const have = new Map()
  for (const row of [...saved.filter((r) => r.isbn === isbn13), ...saved]) {
    if (!have.has(row.source)) have.set(row.source, row.found ? row.data : null)
  }

  const unreachable = []
  // A source's answer: the saved one, or a fresh one (saved for next time).
  // Returns undefined if the source couldn't be reached.
  async function ask(source, look, saveNotFound = true) {
    if (have.has(source)) return have.get(source)
    let data
    try {
      data = await look()
    } catch {
      unreachable.push(source)
      return undefined
    }
    if (libraryId && (data || saveNotFound)) {
      // Not being able to save is no reason to stop; it'll be asked again next time.
      await supabase.from('lookups').upsert({ library_id: libraryId, source, isbn: isbn13, found: Boolean(data), data })
    }
    return data
  }

  const [ol, edition] = await Promise.all([
    ask('openlibrary', () => lookUpOpenLibrary(isbn13, fetchText)),
    ask('openlibrary_edition', () => lookUpOpenLibraryEdition(isbn13, fetchText)),
  ])
  const title = edition?.title ?? ol?.title ?? null
  const author = ol?.author_name?.[0]
  // With no title, Google is searched by ISBN. A miss then isn't saved, so
  // `npm run enrich -- --votes` can still try by title once the book has one.
  const google = await ask(
    'google',
    () => lookUpGoogle({ title, author, surname: author && lastWord(author), isbns: keys }, fetchGoogleJson),
    Boolean(title),
  )
  if (unreachable.length === SOURCES.length) throw new Error('No source could be reached.')

  const book = makePreview(ol, edition, google)
  book.unreachable = [...new Set(unreachable.map((s) => SOURCE_NAMES[s]))]

  // Other editions you own of the same Open Library work, by the ISBNs they were looked up under.
  book.sameWorkIsbns = []
  if (book.workKey) {
    const { data } = await supabase
      .from('lookups')
      .select('isbn')
      .eq('source', 'openlibrary')
      .eq('data->>key', book.workKey)
    book.sameWorkIsbns = (data ?? []).map((r) => r.isbn).filter((i) => !keys.includes(i))
  }
  return book
}

const lastWord = (name) => plain(name).split(' ').at(-1)

// "June 1999" or "1999-06-01" -> 1999
const yearOf = (text) => Number(text?.match(/\b(1[5-9]|20)\d\d\b/)?.[0]) || null

// What to show for the book, taking each detail from the best source that has it:
// this edition's own Open Library record, then Google, then the work record.
function makePreview(ol, edition, google) {
  const info = google?.volumeInfo ?? {}
  const editionCover = edition?.covers?.find((id) => id > 0) ?? null
  const coverId = editionCover ?? ol?.cover_i ?? null
  const googleCover = info.imageLinks && tidyImage(info.imageLinks.thumbnail ?? info.imageLinks.smallThumbnail)
  return {
    found: Boolean(ol || edition || google),
    title: edition?.title ?? ol?.title ?? info.title ?? null,
    subtitle: edition ? (edition.subtitle ?? null) : (info.subtitle ?? null),
    authors: ol?.author_name ?? info.authors ?? [],
    publisher: edition?.publishers?.[0] ?? info.publisher ?? null,
    year: yearOf(edition?.publish_date) ?? yearOf(info.publishedDate),
    pages: edition?.number_of_pages ?? info.pageCount ?? ol?.number_of_pages_median ?? null,
    firstPublished: ol?.first_publish_year ?? null,
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : googleCover,
    workKey: ol?.key ?? null,
    sources: [ol || edition ? 'Open Library' : null, google ? 'Google Books' : null].filter(Boolean),
  }
}

// Copies you own that are another edition of this book: the same Open Library
// work, or the same title (before any colon) with an author in common.
export function otherEditions(copies, book) {
  if (!book?.found) return []
  const sameWork = new Set(book.sameWorkIsbns)
  const title = book.title ? plain(shortTitle(book.title)) : ''
  const surnames = book.authors.map(lastWord)
  const sameTitle = (c) => [c.title, c.original_title].some((t) => t && plain(shortTitle(t)) === title)
  const sharesAuthor = (c) =>
    c.people.some((p) => plain(p.author.sort_name.split(',')[0]).split(' ').some((w) => surnames.includes(w)))
  return copies.filter(
    (c) => sameWork.has(c.isbn13) || sameWork.has(c.isbn10) || (title && sameTitle(c) && sharesAuthor(c)),
  )
}
