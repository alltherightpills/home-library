// Scan to add: looking up a book you don't own, and finding other editions you do.
import { splitName } from './addBook.js'
import { lookUpGoogle, lookUpOpenLibrary, lookUpOpenLibraryEdition, plain, shortTitle } from './bookLookups.js'
import { fetchGoogleJson, tidyImage } from './googleBooks.js'
import { isbn13To10 } from './isbn.js'
import { locCallNumber, locDewey, locOriginalYear, locPages, locSubjects, lookUpLocByIsbn, lookUpLocByTitle } from './locLookups.js'
import { supabase } from './supabase.js'

export async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Asks the Library of Congress through the relay (supabase/functions/loc),
// since the phone can't reach LC's catalog itself.
export async function askLoc(query, max) {
  const { data, error } = await supabase.functions.invoke('loc', { body: { query, max } })
  if (error) throw new Error(error.message)
  return data
}

const SOURCES = ['openlibrary', 'openlibrary_edition', 'loc', 'google', 'loc_search']
const SOURCE_NAMES = {
  openlibrary: 'Open Library', openlibrary_edition: 'Open Library', loc: 'Library of Congress',
  google: 'Google Books', loc_search: 'Library of Congress',
}

// Looks up a new ISBN-13 in Open Library and LC, then Google and LC's other
// editions (which need the title Open Library gives). Answers already saved in
// `lookups` are used instead of asking again; new ones are saved, as `npm run
// enrich` does, so `npm run categories:save` sees the same answers the vote did.
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

  const [ol, edition, lc] = await Promise.all([
    ask('openlibrary', () => lookUpOpenLibrary(isbn13, fetchText)),
    ask('openlibrary_edition', () => lookUpOpenLibraryEdition(isbn13, fetchText)),
    ask('loc', () => lookUpLocByIsbn(isbn10, isbn13, askLoc)),
  ])
  const title = edition?.title ?? ol?.title ?? null
  const author = ol?.author_name?.[0]
  // With no title, Google is searched by ISBN. A miss then isn't saved, so
  // `npm run enrich -- --votes` can still try by title once the book has one.
  // LC's other editions need a title, so with none they aren't asked at all.
  const [google, locSearch] = await Promise.all([
    ask(
      'google',
      () => lookUpGoogle({ title, author, surname: author && lastWord(author), isbns: keys }, fetchGoogleJson),
      Boolean(title),
    ),
    title ? ask('loc_search', () => lookUpLocByTitle(title, author && splitName(author).last, askLoc)) : null,
  ])
  if (unreachable.length === SOURCES.length - (title ? 0 : 1)) throw new Error('No source could be reached.')

  const book = makePreview(ol, edition, google, lc)
  // What the category vote reads, as `npm run categories:save` would.
  book.answers = { locSearch, google, openlibrary: ol }
  book.unreachable = [...new Set(unreachable.map((s) => SOURCE_NAMES[s]))]

  book.sameWorkIsbns = (await sameWorkIsbns(book.workKey)).filter((i) => !keys.includes(i))
  return book
}

// Other editions you own of the same Open Library work, by the ISBNs they were looked up under.
export async function sameWorkIsbns(workKey) {
  if (!workKey) return []
  const { data } = await supabase.from('lookups').select('isbn').eq('source', 'openlibrary').eq('data->>key', workKey)
  return (data ?? []).map((r) => r.isbn)
}

// ['A', 'B', 'C'] -> "A, B and C"
export const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''))

const lastWord = (name) => plain(name).split(' ').at(-1)

// "June 1999" or "1999-06-01" -> 1999
const yearOf = (text) => Number(text?.match(/\b(1[5-9]|20)\d\d\b/)?.[0]) || null

// "paperback", "Mass Market Paperback" -> Paperback; "Cloth" -> Hardcover. The
// app's binding list has only those two, so anything else stays blank.
function bindingOf(format) {
  if (/paper|soft/i.test(format ?? '')) return 'Paperback'
  if (/hard|cloth/i.test(format ?? '')) return 'Hardcover'
  return null
}

// Open Library writes languages as "/languages/eng", Google as "en".
export const LANGUAGES = {
  eng: 'English', en: 'English', fre: 'French', fra: 'French', fr: 'French', spa: 'Spanish', es: 'Spanish',
  ger: 'German', deu: 'German', de: 'German', ita: 'Italian', it: 'Italian', jpn: 'Japanese', ja: 'Japanese',
  lat: 'Latin', la: 'Latin', grc: 'Greek, Ancient', gre: 'Greek, Modern', rus: 'Russian', ru: 'Russian',
  por: 'Portuguese', pt: 'Portuguese', chi: 'Chinese', zh: 'Chinese', dut: 'Dutch', nl: 'Dutch',
}

// Open Library often writes titles in library style ("African American
// folktales"); Google usually has the same words in title case. Same words, so
// take Google's capitals; otherwise keep Open Library's title.
export function betterCase(openLibrary, google) {
  if (!openLibrary) return google ?? null
  return google && plain(google) === plain(openLibrary) ? google : openLibrary
}

// The earliest first-published year from Open Library and LC's reprint date,
// as `npm run enrich` picks it; a year after this edition's can't be right.
export function firstPublished(ol, lc, year) {
  return [
    { year: ol?.first_publish_year, source: 'Open Library' },
    { year: locOriginalYear(lc), source: 'LC catalog (008 reprint date)' },
  ]
    .filter((c) => c.year && (!year || c.year <= year))
    .sort((a, b) => a.year - b.year)[0] ?? { year: null, source: null }
}

// What to show for the book, taking each detail from the best source that has it:
// this edition's own Open Library record, then Google, then the work record.
// LC's record of this edition adds its cataloging, which the category vote reads.
function makePreview(ol, edition, google, lc) {
  const info = google?.volumeInfo ?? {}
  const editionCover = edition?.covers?.find((id) => id > 0) ?? null
  const coverId = editionCover ?? ol?.cover_i ?? null
  const links = info.imageLinks ?? {}
  const googleCover = links.thumbnail || links.smallThumbnail ? tidyImage(links.thumbnail ?? links.smallThumbnail) : null
  // The largest Google image, which is what's saved when Open Library has no cover.
  const googleSize = ['large', 'extraLarge', 'medium', 'small', 'thumbnail', 'smallThumbnail'].find((s) => links[s])
  const languageCodes = edition?.languages?.map((l) => l.key.split('/').pop()) ?? (info.language ? [info.language] : [])
  const year = yearOf(edition?.publish_date) ?? yearOf(info.publishedDate)
  const first = firstPublished(ol, lc, year)
  // Open Library's edition records sometimes carry a Dewey or LC number when LC has none.
  const olDewey = edition?.dewey_decimal_class?.find((d) => /^\d{3}/.test(d)) ?? null
  const olLcc = edition?.lc_classifications?.find((c) => /^[A-Z]{1,3}\s*\d/.test(c)) ?? null
  return {
    isbn10: edition?.isbn_10?.[0] ?? null,
    binding: bindingOf(edition?.physical_format),
    languages: [...new Set(languageCodes.map((code) => LANGUAGES[code]).filter(Boolean))],
    // What the copy's cover fields get when it's added.
    cover: coverId
      ? { cover_id: coverId, cover_source: editionCover ? 'openlibrary_edition' : 'openlibrary_work' }
      : googleSize
        ? { cover_url: tidyImage(links[googleSize]), cover_source: 'google' }
        : null,
    found: Boolean(ol || edition || google),
    title: betterCase(edition?.title ?? ol?.title, info.title),
    subtitle: edition ? betterCase(edition.subtitle, info.subtitle) : (info.subtitle ?? null),
    authors: ol?.author_name ?? info.authors ?? [],
    publisher: edition?.publishers?.[0] ?? info.publisher ?? null,
    year,
    pages: edition?.number_of_pages ?? info.pageCount ?? locPages(lc) ?? ol?.number_of_pages_median ?? null,
    firstPublished: first.year,
    firstPublishedSource: first.source,
    // The copy's cataloging fields: LC's own record first, else Open Library's numbers.
    catalog: {
      lc_subjects: locSubjects(lc),
      lc_call_number: locCallNumber(lc),
      dewey: locDewey(lc) ?? olDewey,
      lcc: olLcc,
    },
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : googleCover,
    workKey: ol?.key ?? null,
    sources: [ol || edition ? 'Open Library' : null, lc ? 'Library of Congress' : null, google ? 'Google Books' : null].filter(Boolean),
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
