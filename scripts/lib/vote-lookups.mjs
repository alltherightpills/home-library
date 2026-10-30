// The two extra searches behind the category vote, for books with or without an
// ISBN: LC by title + author (finds other editions) and Google Books' best match
// (its detail record has publisher labels like "Fiction / Short Stories").

import { USER_AGENT, fetchLoc, parseMarcRecords, sleep } from './lookup-tools.mjs'

// "The Titan's Curse (Percy Jackson, Book 3)" or "Vernon God Little: A Novel" -> the title alone.
export const shortTitle = (title) =>
  title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').split(/[:/]/)[0].replace(/\s+/g, ' ').trim()

// Lower case, no accents or punctuation, so "Moby-Dick" and "MOBY DICK" compare equal.
export const plain = (text) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// Records whose title starts with the book's title and that name the author.
export async function lookUpLocByTitle(title, surname) {
  const short = shortTitle(title).replace(/"/g, '')
  if (!short) return null
  const query = `dc.title="${short}"` + (surname ? ` and bath.author="${surname.replace(/"/g, '')}"` : '')
  const url =
    'http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve' +
    `&query=${encodeURIComponent(query)}&maximumRecords=10&recordSchema=marcxml`
  const records = parseMarcRecords(await fetchLoc(url)).filter((r) => {
    const f245 = r.fields.find((f) => f.tag === '245')
    const heading = f245?.sub.filter(([c]) => c === 'a' || c === 'b').map(([, v]) => v).join(' ') ?? ''
    return plain(heading).startsWith(plain(short))
  })
  return records.length ? { query, records } : null
}

// Thrown when Google says today's allowance is used up, so the run can stop asking.
export class GoogleCapReached extends Error {}

const googleKey = () => {
  if (!process.env.GOOGLE_BOOKS_KEY) process.loadEnvFile('.env.local')
  return process.env.GOOGLE_BOOKS_KEY
}
let nextGoogle = 0
export let googleCalls = 0

// Not the shared pacer: its retries would spend the daily allowance on refusals.
// A 429 can mean "too fast this minute", so wait a minute once before giving up.
async function fetchGoogle(path) {
  for (let attempt = 1; ; attempt++) {
    const wait = nextGoogle - Date.now()
    if (wait > 0) await sleep(wait)
    nextGoogle = Date.now() + 1000
    googleCalls++
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes${path}key=${googleKey()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    })
    if (res.ok) return res.json()
    const body = await res.text()
    if (res.status === 429 || (res.status === 403 && /rateLimitExceeded|dailyLimitExceeded|quota/i.test(body))) {
      if (attempt === 1) {
        await sleep(60_000)
        continue
      }
      throw new GoogleCapReached(`Google Books refused: HTTP ${res.status}`)
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(5000 * attempt)
      continue
    }
    throw new Error(`HTTP ${res.status}`)
  }
}

// The volume with this exact ISBN, else the first with this title and author.
export function bestGoogleMatch(items, { title, surname, isbns }) {
  const short = plain(shortTitle(title))
  const hasIsbn = (it) => (it.volumeInfo?.industryIdentifiers ?? []).some((i) => isbns.includes(i.identifier))
  const sameBook = (it) => {
    const info = it.volumeInfo ?? {}
    if (!plain(info.title ?? '').startsWith(short)) return false
    return !surname || (info.authors ?? []).some((a) => plain(a).includes(plain(surname)))
  }
  const exact = items.find(hasIsbn)
  if (exact?.volumeInfo.categories?.length) return { item: exact, matched_by: 'isbn' }
  // Some editions carry no labels at all, so prefer one that has them.
  const same = items.filter(sameBook)
  const similar = same.find((it) => it.volumeInfo.categories?.length) ?? same[0]
  if (similar?.volumeInfo.categories?.length || !exact) return similar ? { item: similar, matched_by: 'title_author' } : null
  return { item: exact, matched_by: 'isbn' }
}

// Word search, then the matched volume's detail record: up to 2 calls per book.
export async function lookUpGoogle({ title, author, surname, isbns }) {
  const short = shortTitle(title)
  if (!short) return null
  const query = [short, author].filter(Boolean).join(' ')
  const { items = [] } = await fetchGoogle(`?q=${encodeURIComponent(query)}&maxResults=10&`)
  const match = bestGoogleMatch(items, { title, surname, isbns })
  if (!match) return null
  const detail = await fetchGoogle(`/${match.item.id}?`)
  return { query, matched_by: match.matched_by, volume_id: detail.id, volumeInfo: detail.volumeInfo }
}
