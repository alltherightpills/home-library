import { useEffect, useState } from 'react'
import { hasGoogleKey, largestGoogleCover, measureGoogleCover, searchGoogleBooks } from './googleBooks.js'
import { supabase } from './supabase.js'

const OL = 'https://openlibrary.org'
const olCover = (id) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`

async function getJson(url) {
  const res = await fetch(url)
  return res.ok ? res.json() : null
}

// Covers from every edition of this book on Open Library.
async function openLibraryCandidates(copy, mine) {
  const isbn = copy.isbn13 ?? copy.isbn10
  const query = isbn
    ? `q=isbn:${isbn}`
    : `title=${encodeURIComponent(copy.title)}&author=${encodeURIComponent(copy.byline)}`
  const work = (await getJson(`${OL}/search.json?${query}&fields=key&limit=1`))?.docs?.[0]?.key
  if (!work) return []
  const editions = (await getJson(`${OL}${work}/editions.json?limit=100`))?.entries ?? []
  const seen = new Set()
  return editions.flatMap((e) => {
    const id = e.covers?.find((c) => c > 0)
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{
      key: `ol-${id}`,
      src: olCover(id),
      source: 'Open Library',
      note: [e.publishers?.[0], e.publish_date].filter(Boolean).join(', '),
      mine: [...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])].some((i) => mine.has(i)),
      // The original upload's size, from the cover's own small record.
      measure: async () => getJson(`https://covers.openlibrary.org/b/id/${id}.json`),
      save: async () => ({ cover_id: id, cover_url: null, cover_source: 'picked_openlibrary' }),
    }]
  })
}

// Covers from Google Books, found by title and author.
async function googleCandidates(copy, mine) {
  if (!hasGoogleKey) return []
  const words = `${copy.title.split(/[:(]/)[0]} ${copy.byline.split(',')[0]}`
  const volumes = await searchGoogleBooks(words)
  return volumes.map((v) => ({
    key: `g-${v.id}`,
    src: v.thumbnail,
    source: 'Google Books',
    note: v.note,
    mine: v.isbns.some((i) => mine.has(i)),
    measure: () => measureGoogleCover(v.thumbnail),
    save: async () => ({ cover_url: (await largestGoogleCover(v.id)) ?? v.thumbnail, cover_source: 'picked_google' }),
  }))
}

// A phone photo is several megabytes; a cover needs far less. Shrink to at most
// 2000px on the long side (enough for a cover filling an iPhone screen, about
// 1,200px wide) and save as JPEG.
async function shrinkPhoto(file) {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

// "907 × 1360", "measuring…" until it's known, or "size unknown".
function sizeText(sizes, key) {
  if (!(key in sizes)) return 'measuring…'
  const size = sizes[key]
  return size ? `${size.width} × ${size.height}` : 'size unknown'
}

// Choose a cover for one copy: from Google Books, any Open Library edition, or a photo.
function CoverPicker({ copy, onPicked, onCancel }) {
  const [candidates, setCandidates] = useState(null) // null while searching
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Sources that couldn't be searched, so an empty result isn't mistaken for "no covers".
  const [unreachable, setUnreachable] = useState([])
  // Each cover's full size, by key, as it's measured: { width, height }, or null if unknown.
  const [sizes, setSizes] = useState({})

  // Measure the covers a few at a time, so the first sizes show up quickly.
  useEffect(() => {
    if (!candidates?.length) return
    let cancelled = false
    const queue = [...candidates]
    const worker = async () => {
      for (let c = queue.shift(); c && !cancelled; c = queue.shift()) {
        const size = await c.measure().catch(() => null)
        if (!cancelled) setSizes((s) => ({ ...s, [c.key]: size?.width ? { width: size.width, height: size.height } : null }))
      }
    }
    for (let i = 0; i < 4; i++) worker()
    return () => {
      cancelled = true
    }
  }, [candidates])

  useEffect(() => {
    let cancelled = false
    const mine = new Set([copy.isbn13, copy.isbn10].filter(Boolean))
    const failed = []
    const tryFrom = (name, search) => search.catch(() => {
      failed.push(name)
      return []
    })
    Promise.all([
      tryFrom('Google Books', googleCandidates(copy, mine)),
      tryFrom('Open Library', openLibraryCandidates(copy, mine)),
    ]).then(([google, ol]) => {
      if (cancelled) return
      setUnreachable(failed)
      // Your own edition first; otherwise Google before Open Library.
      setCandidates([...google, ...ol].sort((a, b) => b.mine - a.mine))
    })
    return () => {
      cancelled = true
    }
  }, [copy])

  async function save(getChanges) {
    setSaving(true)
    setError('')
    try {
      const changes = await getChanges()
      const { error } = await supabase.from('copies').update(changes).eq('id', copy.id)
      if (error) throw new Error(error.message)
      // A replaced photo is no longer used anywhere, so remove its file.
      // (If that fails, the new cover is still saved; the old file just stays.)
      const oldPhoto = copy.cover_source === 'photo' && copy.cover_url?.split('/object/public/covers/')[1]
      if (oldPhoto) await supabase.storage.from('covers').remove([oldPhoto])
      onPicked(changes)
    } catch (err) {
      setError(`Couldn't save the cover: ${err.message}`)
      setSaving(false)
    }
  }

  async function uploadPhoto(file) {
    const photo = await shrinkPhoto(file)
    const path = `${copy.library_id}/${copy.id}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('covers').upload(path, photo, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    const url = supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
    return { cover_url: url, cover_source: 'photo' }
  }

  return (
    <div className="cover-picker">
      <button className="link" onClick={onCancel}>
        ‹ Cancel
      </button>
      <h2>Choose a cover</h2>
      <p className="book-meta">{copy.title}</p>

      {/* Without `capture`, iPhone offers both Take Photo and Photo Library. */}
      <label className={saving ? 'primary photo-button disabled' : 'primary photo-button'}>
        📷 Photo of your copy
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={saving}
          onChange={(e) => e.target.files[0] && save(() => uploadPhoto(e.target.files[0]))}
        />
      </label>

      {saving && <p className="placeholder">Saving…</p>}
      {error && <p className="error">{error}</p>}
      {unreachable.length > 0 && (
        <p className="scan-hint">
          {unreachable.join(' and ')} couldn't be searched, so {unreachable.length > 1 ? 'their' : 'its'} covers aren't shown.
          {unreachable.includes('Google Books') && ' (Google only answers the live app and localhost, not the Mac\'s network address.)'}
        </p>
      )}
      {!hasGoogleKey && <p className="diagnostic">Google Books isn't connected yet, so only Open Library covers are shown.</p>}

      {candidates === null && <p className="placeholder">Looking for covers…</p>}
      {candidates?.length === 0 && <p className="placeholder">No covers found online. A photo of your copy will do.</p>}
      {candidates?.length > 0 && (
        <ul className="cover-grid">
          {candidates.map((c) => (
            <li key={c.key}>
              <button onClick={() => save(c.save)} disabled={saving}>
                <img src={c.src} alt="" loading="lazy" />
                <span className="cover-note">
                  {c.mine && <strong>Your edition · </strong>}
                  {c.source}
                  {c.note && ` · ${c.note}`}
                </span>
                <span className="cover-note cover-size">{sizeText(sizes, c.key)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CoverPicker
