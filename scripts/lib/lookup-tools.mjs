// Shared by the lookup scripts: polite fetching and asking LC.

import { locUrl } from '../../src/locLookups.js'

export const USER_AGENT = 'HomeLibrary/0.1 (personal catalog; github.com/alltherightpills/home-library)'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The file at this address, trying three times; null if it's missing or won't load.
export async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      if (res.status === 404) return null
    } catch {
      // A slow or dropped answer: try again.
    }
    await sleep(2000 * attempt)
  }
  return null
}

export function pacer(minGapMs) {
  let next = 0
  return async function fetchPolitely(url) {
    for (let attempt = 1; ; attempt++) {
      const wait = next - Date.now()
      if (wait > 0) await sleep(wait)
      next = Date.now() + minGapMs
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        })
        if (res.ok) return await res.text()
        // Too many requests or a server hiccup: back off and try again.
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          next = Date.now() + minGapMs * 10 * attempt
          continue
        }
        throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        if (attempt >= 4) throw err
        next = Date.now() + minGapMs * 10 * attempt
      }
    }
  }
}

// One LC server, one pace, whichever kind of search is asking.
export const fetchLoc = pacer(2000)

// The scripts' way of asking LC: straight to its server, at that pace.
export const askLoc = (query, max) => fetchLoc(locUrl(query, max))
