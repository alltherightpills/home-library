// Asking Open Library and Google Books about a book. Shared by the app (Scan
// to add) and the scripts (`npm run enrich`), so both judge a match the same way.
// Each caller passes its own fetcher: the scripts pace their calls and send a
// User-Agent, and the app calls straight from the phone.
//
//   fetchText(url) -> the answer as text; throws Error('HTTP 404') and the like
//   fetchGoogle(path) -> Google's JSON answer, for a path such as "?q=...&" or "/<id>?"

// "The Titan's Curse (Percy Jackson, Book 3)" or "Vernon God Little: A Novel" -> the title alone.
export const shortTitle = (title) =>
  title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').split(/[:/]/)[0].replace(/\s+/g, ' ').trim()

// Lower case, no accents or punctuation, so "Moby-Dick" and "MOBY DICK" compare equal.
export const plain = (text) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,edition_count'

// Returns Open Library's work-level record for this ISBN, or null.
export async function lookUpOpenLibrary(isbn, fetchText) {
  const url = `https://openlibrary.org/search.json?q=isbn:${isbn}&fields=${OL_FIELDS}&limit=1`
  return JSON.parse(await fetchText(url)).docs?.[0] ?? null
}

// Open Library's works with this title (and author, if given), best match first.
// Each covers every edition, so its publisher and Dewey lists mix them all.
export async function searchOpenLibrary(title, author, fetchText, limit = 5) {
  const params = new URLSearchParams({ title, fields: OL_FIELDS, limit: String(limit) })
  if (author) params.set('author', author)
  return JSON.parse(await fetchText(`https://openlibrary.org/search.json?${params}`)).docs ?? []
}

// Returns Open Library's record for this exact edition, or null. Its cover is
// this ISBN's own, unlike the work record's, which can come from any edition.
export async function lookUpOpenLibraryEdition(isbn, fetchText) {
  try {
    return JSON.parse(await fetchText(`https://openlibrary.org/isbn/${isbn}.json`))
  } catch (err) {
    if (err.message === 'HTTP 404') return null
    throw err
  }
}

// The volume with this exact ISBN, else the first with this title and author.
export function bestGoogleMatch(items, { title, surname, isbns }) {
  const hasIsbn = (it) => (it.volumeInfo?.industryIdentifiers ?? []).some((i) => isbns.includes(i.identifier))
  const exact = items.find(hasIsbn)
  // With no title to go on (an ISBN search), only the exact ISBN will do.
  if (!title) return exact ? { item: exact, matched_by: 'isbn' } : null
  const short = plain(shortTitle(title))
  const sameBook = (it) => {
    const info = it.volumeInfo ?? {}
    if (!plain(info.title ?? '').startsWith(short)) return false
    return !surname || (info.authors ?? []).some((a) => plain(a).includes(plain(surname)))
  }
  if (exact?.volumeInfo.categories?.length) return { item: exact, matched_by: 'isbn' }
  // Some editions carry no labels at all, so prefer one that has them.
  const same = items.filter(sameBook)
  const similar = same.find((it) => it.volumeInfo.categories?.length) ?? same[0]
  if (similar?.volumeInfo.categories?.length || !exact) return similar ? { item: similar, matched_by: 'title_author' } : null
  return { item: exact, matched_by: 'isbn' }
}

// Word search by title and author (or by ISBN when there's no title yet), then
// the matched volume's detail record: up to 2 calls per book.
export async function lookUpGoogle({ title, author, surname, isbns }, fetchGoogle) {
  const short = title ? shortTitle(title) : ''
  if (!short && !isbns.length) return null
  const query = short ? [short, author].filter(Boolean).join(' ') : `isbn:${isbns[0]}`
  const { items = [] } = await fetchGoogle(`?q=${encodeURIComponent(query)}&maxResults=10&`)
  const match = bestGoogleMatch(items, { title: short && title, surname, isbns })
  if (!match) return null
  const detail = await fetchGoogle(`/${match.item.id}?`)
  return { query, matched_by: match.matched_by, volume_id: detail.id, volumeInfo: detail.volumeInfo }
}
