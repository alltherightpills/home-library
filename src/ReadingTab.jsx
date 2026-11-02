import { useEffect, useState } from 'react'
import BookReading from './BookReading.jsx'
import { Field } from './EditBook.jsx'
import IsbnReader from './IsbnReader.jsx'
import { hasGoogleKey, searchGoogleBooks } from './googleBooks.js'
import { copiesWithIsbn } from './isbn.js'
import { dateText } from './readings.js'
import { listText, lookUpNewBook } from './scanLookup.js'
import { coverUrl } from './useCatalog.js'

// How many books Recently finished and Set aside each show.
const RECENT = 10

// The last "Borrowed from", remembered on the phone for the next borrowed book.
const FROM_KEY = 'reading.borrowedFrom'

// Covers for a borrowed book with no ISBN record: a few from Open Library and a
// few from Google, by title and author, to pick from (the first match is often
// another book, so nothing is picked for you). A source that fails gives none.
async function findCovers(title, author) {
  const params = new URLSearchParams({ title, fields: 'cover_i', limit: '20' })
  if (author) params.set('author', author)
  const openLibrary = fetch(`https://openlibrary.org/search.json?${params}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => [...new Set((json?.docs ?? []).map((d) => d.cover_i).filter(Boolean))].slice(0, 6))
    .then((ids) => ids.map((id) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`))
    .catch(() => [])
  const google = hasGoogleKey
    ? searchGoogleBooks(`${title} ${author}`)
        .then((volumes) => volumes.slice(0, 6).map((v) => v.thumbnail))
        .catch(() => [])
    : []
  return [...(await openLibrary), ...(await google)]
}

// The Reading tab: a Scan button that starts or finishes a book, what you're
// reading now, and what you've finished or set aside lately.
function ReadingTab({ copies, readings, onOpenBook }) {
  // Showing the camera, or what a scan found ({ isbn, owned, borrowed }), or neither.
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState(null)
  // The reading whose edit form is open in a list, if any.
  const [editingId, setEditingId] = useState(null)

  if (readings.error) return <p className="error">Couldn't load your reading: {readings.error}</p>
  if (!copies || !readings.list) return <p className="placeholder">Loading your books…</p>

  const copyById = new Map(copies.map((c) => [c.id, c]))
  const newestFirst = (a, b) => (b.ended_on ?? '').localeCompare(a.ended_on ?? '') || b.created_at.localeCompare(a.created_at)
  const current = readings.list
    .filter((r) => r.status === 'reading')
    .sort((a, b) => (b.started_on ?? '').localeCompare(a.started_on ?? '') || b.created_at.localeCompare(a.created_at))
  // Past reads with no date (marked "read before") aren't recent, so they're left out.
  const finished = readings.list.filter((r) => r.status === 'finished' && r.ended_on).sort(newestFirst).slice(0, RECENT)
  const setAside = readings.list.filter((r) => r.status === 'set_aside').sort(newestFirst).slice(0, RECENT)

  // A scanned or typed ISBN: copies you own with it, or a borrowed book you're
  // reading with it (so the same scan finishes it). Kept as found at scan time,
  // so finishing a book doesn't swap the screen for the "start" form.
  function handleIsbn(isbn) {
    setScanning(false)
    const borrowed = readings.list.filter((r) => !r.copy_id && r.isbn === isbn && r.status === 'reading').map((r) => r.id)
    setFound({ isbn, owned: copiesWithIsbn(copies, isbn), borrowed })
  }

  function noIsbn() {
    setScanning(false)
    setFound({ isbn: null, owned: [], borrowed: [] })
  }

  // Places borrowed from before, suggested in the borrowed-book forms.
  const places = [...new Set(readings.list.map((r) => r.borrowed_from).filter(Boolean))].sort()

  // A book with its buttons. One with no book page (borrowed, or a copy since
  // removed) has Edit here instead, the only place it shows.
  function row(r, actions) {
    const copy = copyById.get(r.copy_id)
    return (
      <ReadingRow key={r.id} reading={r} copy={copy} onOpenBook={onOpenBook}>
        {editingId === r.id ? (
          <EditReading reading={r} readings={readings} onClose={() => setEditingId(null)} />
        ) : (
          <>
            {actions}
            {!copy && (
              <button className="link edit-link" onClick={() => setEditingId(r.id)}>
                Edit
              </button>
            )}
          </>
        )}
      </ReadingRow>
    )
  }

  return (
    <div className="reading-tab">
      <datalist id="borrowed-from">
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {scanning ? (
        <div className="reading-scan">
          <IsbnReader onIsbn={handleIsbn} startNow>
            <p className="by-hand-link">
              <button className="link" onClick={noIsbn}>
                Borrowed book with no ISBN? Type it in
              </button>
            </p>
          </IsbnReader>
          <button className="link" onClick={() => setScanning(false)}>
            Cancel
          </button>
        </div>
      ) : found ? (
        <ScanFound
          found={found}
          copies={copies}
          readings={readings}
          row={row}
          onOpenBook={onOpenBook}
          onDone={() => setFound(null)}
          onScanAgain={() => {
            setFound(null)
            setScanning(true)
          }}
        />
      ) : (
        <button className="primary scan-to-read" onClick={() => setScanning(true)}>
          Scan a book to start or finish
        </button>
      )}

      <h2>Currently reading</h2>
      {current.length === 0 ? (
        <p className="placeholder">Nothing right now. Scan a book, or use Start reading on its page.</p>
      ) : (
        <ul className="reading-list">
          {current.map((r) => row(r, <EndButtons reading={r} readings={readings} />))}
        </ul>
      )}

      {finished.length > 0 && (
        <>
          <h2>Recently finished</h2>
          <ul className="reading-list">{finished.map((r) => row(r))}</ul>
        </>
      )}

      {setAside.length > 0 && (
        <>
          <h2>Set aside</h2>
          <ul className="reading-list">{setAside.map((r) => row(r))}</ul>
        </>
      )}
    </div>
  )
}

// What a scan found: the copy (or copies) you own with that ISBN, each with its
// Reading section; a borrowed book you're reading, to finish; or, for a book you
// don't own, the form to start reading it as a borrowed book.
function ScanFound({ found, copies, readings, row, onOpenBook, onDone, onScanAgain }) {
  const { isbn, owned, borrowed } = found
  const borrowedNow = readings.list.filter((r) => borrowed.includes(r.id))
  let body
  if (owned.length > 0) {
    body = (
      <>
        {owned.length > 1 && <p>You own {owned.length} copies with this ISBN. Pick the one you're reading.</p>}
        {owned.map((copy) => (
          <div key={copy.id} className="reading-found-copy">
            <ul className="reading-list">
              <ReadingRow copy={copy} onOpenBook={onOpenBook} />
            </ul>
            <BookReading copy={copy} readings={readings} />
          </div>
        ))}
      </>
    )
  } else if (borrowedNow.length > 0) {
    body = (
      <ul className="reading-list">
        {borrowedNow.map((r) => row(r, r.status === 'reading' && <EndButtons reading={r} readings={readings} />))}
      </ul>
    )
  } else {
    return <BorrowForm isbn={isbn} libraryId={copies[0]?.library_id} readings={readings} onDone={onDone} />
  }
  return (
    <div className="reading-found">
      {body}
      <div className="reading-actions">
        <button className="primary" onClick={onDone}>
          Done
        </button>
        <button className="link" onClick={onScanAgain}>
          Scan another
        </button>
      </div>
    </div>
  )
}

// Starting a borrowed book: looked up by its ISBN when it has one (the same
// sources as the Scan tab), with the title and author editable either way.
function BorrowForm({ isbn, libraryId, readings, onDone }) {
  const [lookup, setLookup] = useState(isbn ? { status: 'looking' } : { status: 'none' })
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [from, setFrom] = useState(() => localStorage.getItem(FROM_KEY) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A cover picked from Find a cover.
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!isbn) return
    let cancelled = false
    lookUpNewBook(isbn, libraryId).then(
      (book) => {
        if (cancelled) return
        setLookup({ status: 'done', book })
        // Fill in only what hasn't been typed meanwhile.
        if (book.found) {
          setTitle((t) => t || book.title || '')
          setAuthor((a) => a || book.authors.join(', '))
        }
      },
      (err) => !cancelled && setLookup({ status: 'error', message: err.message }),
    )
    return () => {
      cancelled = true
    }
  }, [isbn, libraryId])

  const book = lookup.book?.found ? lookup.book : null

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await readings.startBorrowed({
        libraryId,
        title: title.trim(),
        author: author.trim(),
        isbn,
        coverUrl: picked ?? book?.coverUrl ?? null,
        borrowedFrom: from.trim(),
      })
      localStorage.setItem(FROM_KEY, from.trim())
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="reading-found edit-book" onSubmit={save}>
      {lookup.status === 'none' && <p>A borrowed book with no ISBN: type its title and author.</p>}
      {lookup.status === 'looking' && <p>ISBN {isbn} isn't in your library. Looking it up…</p>}
      {lookup.status === 'error' && (
        <p>ISBN {isbn} isn't in your library, and it couldn't be looked up (check your connection). Type its title and author.</p>
      )}
      {lookup.status === 'done' && !book && (
        <p>ISBN {isbn} isn't in your library, and no record was found. Type its title and author.</p>
      )}
      {book && (
        <div className="scan-preview">
          <span className="thumb large">{book.coverUrl && <img src={book.coverUrl} alt="" />}</span>
          <p className="book-meta">
            Not in your library. Found in {listText(book.sources)}; check the title and author.
          </p>
        </div>
      )}
      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Author" value={author} onChange={setAuthor} />
      {!book?.coverUrl && lookup.status !== 'looking' && (
        <CoverSearch title={title} author={author} picked={picked} setPicked={setPicked} />
      )}
      <Field label="Borrowed from (optional)" value={from} onChange={setFrom} list="borrowed-from" />
      {error && <p className="error">{error}</p>}
      <div className="reading-actions">
        <button className="primary" type="submit" disabled={busy || !title.trim()}>
          Start reading (borrowed)
        </button>
        <button className="link" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// Find a cover: covers by title and author to tap (tap again to leave it out).
function CoverSearch({ title, author, picked, setPicked }) {
  // null before searching, 'looking' meanwhile, then the covers found.
  const [covers, setCovers] = useState(null)

  async function search() {
    setCovers('looking')
    setCovers(await findCovers(title.trim(), author.trim()))
  }

  return (
    <div>
      <button type="button" className="link" disabled={!title.trim() || covers === 'looking'} onClick={search}>
        {covers === 'looking' ? 'Looking for covers…' : covers ? 'Search covers again' : 'Find a cover'}
      </button>
      {Array.isArray(covers) && covers.length === 0 && <p className="placeholder">No covers found for that title and author.</p>}
      {Array.isArray(covers) && covers.length > 0 && (
        <>
          <p className="book-meta">Tap the right cover, if it's here. Tap again to leave it out.</p>
          <ul className="cover-grid">
            {covers.map((src) => (
              <li key={src}>
                <button type="button" className={src === picked ? 'picked' : ''} onClick={() => setPicked(src === picked ? null : src)}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// Editing a reading with no book page (a borrowed book, or a copy since
// removed): title, author, where it was borrowed from, dates, cover; or
// removing it from your history.
function EditReading({ reading, readings, onClose }) {
  const [title, setTitle] = useState(reading.title ?? '')
  const [author, setAuthor] = useState(reading.author ?? '')
  const [from, setFrom] = useState(reading.borrowed_from ?? '')
  const [started, setStarted] = useState(reading.started_on ?? '')
  const [ended, setEnded] = useState(reading.ended_on ?? '')
  const [cover, setCover] = useState(reading.cover_url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endLabel = reading.status === 'set_aside' ? 'Set aside on' : 'Finished on'

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function save(e) {
    e.preventDefault()
    if (started && ended && ended < started) {
      setError(`${endLabel} is before the start date.`)
      return
    }
    run(() =>
      readings.update(reading, {
        title: title.trim(),
        author: author.trim() || null,
        borrowed_from: reading.borrowed ? from.trim() || null : reading.borrowed_from,
        started_on: started || null,
        ended_on: reading.status === 'reading' ? null : ended || null,
        cover_url: cover,
      }),
    )
  }

  return (
    <form className="edit-book edit-reading" onSubmit={save}>
      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Author" value={author} onChange={setAuthor} />
      {reading.borrowed && <Field label="Borrowed from (optional)" value={from} onChange={setFrom} list="borrowed-from" />}
      <label>
        Started on
        <input type="date" value={started} onChange={(e) => setStarted(e.target.value)} />
      </label>
      {reading.status !== 'reading' && (
        <label>
          {endLabel}
          <input type="date" value={ended} onChange={(e) => setEnded(e.target.value)} />
        </label>
      )}
      {cover && (
        <div className="scan-preview">
          <span className="thumb large">
            <img src={cover} alt="" />
          </span>
          <button type="button" className="link" onClick={() => setCover(null)}>
            No cover
          </button>
        </div>
      )}
      <CoverSearch title={title} author={author} picked={cover} setPicked={setCover} />
      {error && <p className="error">{error}</p>}
      <div className="reading-actions">
        <button className="primary" type="submit" disabled={busy || !title.trim()}>
          Save
        </button>
        <button className="link" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
      <button
        className="link"
        type="button"
        disabled={busy}
        onClick={() => confirm('Remove this from your reading history?') && run(() => readings.remove(reading))}
      >
        Remove from history
      </button>
    </form>
  )
}

// Finished and Set aside for a book being read.
function EndButtons({ reading, readings }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function end(status) {
    setBusy(true)
    setError('')
    try {
      await readings.end(reading, status)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  return (
    <>
      <div className="reading-actions">
        <button className="primary" disabled={busy} onClick={() => end('finished')}>
          Finished
        </button>
        <button className="link" disabled={busy} onClick={() => end('set_aside')}>
          Set aside
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  )
}

// One book: its cover, title and a dated line, opening its page when tapped.
// A reading with no copy (a borrowed book, or a removed one) shows what it kept.
function ReadingRow({ reading, copy, onOpenBook, children }) {
  const title = copy?.title ?? reading.title
  const byline = copy ? copy.byline : reading.author
  const cover = copy ? coverUrl(copy, 'M') : reading.cover_url
  const lent = !copy && reading?.borrowed && (reading.borrowed_from ? `Borrowed from ${reading.borrowed_from}` : 'Borrowed')
  const when = reading && whenText(reading)
  const inside = (
    <>
      <span className="thumb">{cover && <img src={cover} alt="" loading="lazy" />}</span>
      <span className="book-title">{title}</span>
      <span className="book-meta">{[byline, lent, when].filter(Boolean).join(' · ')}</span>
    </>
  )
  return (
    <li>
      {copy ? (
        <button className="reading-book" onClick={() => onOpenBook(copy.id)}>
          {inside}
        </button>
      ) : (
        <div className="reading-book">{inside}</div>
      )}
      {children}
    </li>
  )
}

// "Since Nov 2, 2026", "Finished Nov 2, 2026", "Set aside Oct 20, 2026".
function whenText(r) {
  if (r.status === 'reading') return r.started_on && `Since ${dateText(r.started_on)}`
  return r.ended_on && `${r.status === 'finished' ? 'Finished' : 'Set aside'} ${dateText(r.ended_on)}`
}

export default ReadingTab
