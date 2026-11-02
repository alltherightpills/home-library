// The two extra searches behind the category vote, for books with or without an
// ISBN: LC by title + author (finds other editions) and Google Books' best match
// (its detail record has publisher labels like "Fiction / Short Stories").

import { lookUpGoogle as lookUpGoogleWith, plain, shortTitle } from '../../src/bookLookups.js'
import { lookUpLocByTitle as lookUpLocByTitleWith } from '../../src/locLookups.js'
import { USER_AGENT, askLoc, sleep } from './lookup-tools.mjs'

export { plain, shortTitle }

// Records whose title starts with the book's title and that name the author
// (the rules are in src/locLookups.js).
export const lookUpLocByTitle = (title, surname) => lookUpLocByTitleWith(title, surname, askLoc)

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

// Google's best match for a book (the rules are in src/bookLookups.js). The
// scripts always know the title, so they never fall back to an ISBN search.
export function lookUpGoogle(book) {
  if (!shortTitle(book.title)) return null
  return lookUpGoogleWith(book, fetchGoogle)
}
