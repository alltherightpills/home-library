// Google Books lookups from the app. This key is public by design (anyone can
// read it in the app's code), so Google only accepts it from this app's web
// address and only for the Books API. The scripts use a separate key in .env.local.
const GOOGLE_BOOKS_APP_KEY = 'AIzaSyC0LLO3JFgYDwq2JSzi9_7udY_ay4ApNwo'

const API = 'https://www.googleapis.com/books/v1/volumes'

export const hasGoogleKey = Boolean(GOOGLE_BOOKS_APP_KEY)

// Google's image links come as http and with a page-curl effect; ask for neither.
const tidyImage = (url) => url.replace(/^http:/, 'https:').replace('&edge=curl', '')

// Volumes matching these words that have a cover image.
export async function searchGoogleBooks(words) {
  const res = await fetch(`${API}?q=${encodeURIComponent(words)}&maxResults=20&key=${GOOGLE_BOOKS_APP_KEY}`)
  if (!res.ok) throw new Error(`Google Books: HTTP ${res.status}`)
  const items = (await res.json()).items ?? []
  return items
    .filter((it) => it.volumeInfo.imageLinks)
    .map((it) => {
      const info = it.volumeInfo
      const links = info.imageLinks
      return {
        id: it.id,
        thumbnail: tidyImage(links.thumbnail ?? links.smallThumbnail),
        isbns: (info.industryIdentifiers ?? []).map((i) => i.identifier),
        note: [info.publisher, info.publishedDate].filter(Boolean).join(', '),
      }
    })
}

// The best cover image Google has for one volume (search results only carry a thumbnail).
export async function largestGoogleCover(volumeId) {
  const res = await fetch(`${API}/${volumeId}?key=${GOOGLE_BOOKS_APP_KEY}`)
  if (!res.ok) return null
  const links = (await res.json()).volumeInfo?.imageLinks ?? {}
  const size = ['large', 'extraLarge', 'medium', 'small', 'thumbnail'].find((s) => links[s])
  return size ? tidyImage(links[size]) : null
}
