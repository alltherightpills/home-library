// Google Books lookups from the app. This key is public by design (anyone can
// read it in the app's code), so Google only accepts it from this app's web
// address and only for the Books API. The scripts use a separate key in .env.local.
const GOOGLE_BOOKS_APP_KEY = 'AIzaSyC0LLO3JFgYDwq2JSzi9_7udY_ay4ApNwo'

const API = 'https://www.googleapis.com/books/v1/volumes'

export const hasGoogleKey = Boolean(GOOGLE_BOOKS_APP_KEY)

// Google's image links come as http and with a page-curl effect; ask for neither.
export const tidyImage = (url) => url.replace(/^http:/, 'https:').replace('&edge=curl', '')

// The fetcher that src/bookLookups.js expects, for a path such as "?q=...&" or "/<id>?".
export async function fetchGoogleJson(path) {
  const res = await fetch(`${API}${path}key=${GOOGLE_BOOKS_APP_KEY}`)
  if (!res.ok) throw new Error(`Google Books: HTTP ${res.status}`)
  return res.json()
}

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
  return size ? fullSizeGoogle(tidyImage(links[size])) : null
}

// An image's width and height once loaded, or null if it won't load.
function imageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Google's links ask for a set size (zoom=1 is 128px wide, zoom=4 800px);
// zoom=0 gives the image as the publisher sent it, often 1,500px or more. For a
// book Google has only a thumbnail for, zoom=0 gives an "image not available"
// picture (575 x 750), so then the link stays as it was.
export async function fullSizeGoogle(url) {
  return (await measureGoogleCover(url)).url
}

// The size of the image fullSizeGoogle would choose: { url, width, height }
// (width and height undefined if neither would load). Loading the full image is
// the only way to know, so this downloads it (often 100 KB to 1 MB).
export async function measureGoogleCover(url) {
  const full = `${url.replace(/&zoom=\d+/, '').replace(/&fife=[^&]*/, '')}&zoom=0`
  const size = await imageSize(full)
  const placeholder = size?.width === 575 && size?.height === 750
  if (size && !placeholder && size.width > 128) return { url: full, ...size }
  return { url, ...(await imageSize(url)) }
}
