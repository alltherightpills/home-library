import { useState } from 'react'
import BookReading from './BookReading.jsx'
import IsbnReader from './IsbnReader.jsx'
import { copiesWithIsbn } from './isbn.js'
import { dateText } from './readings.js'
import { coverUrl } from './useCatalog.js'

// How many books Recently finished and Set aside each show.
const RECENT = 10

// The Reading tab: a Scan button that starts or finishes a book, what you're
// reading now, and what you've finished or set aside lately.
function ReadingTab({ copies, readings, onOpenBook }) {
  // Showing the camera, or what a scan found ({ isbn, owned }), or neither.
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState(null)

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

  function handleIsbn(isbn) {
    setScanning(false)
    setFound({ isbn, owned: copiesWithIsbn(copies, isbn) })
  }

  const row = (r, actions) => (
    <ReadingRow key={r.id} reading={r} copy={copyById.get(r.copy_id)} onOpenBook={onOpenBook}>
      {actions}
    </ReadingRow>
  )

  return (
    <div className="reading-tab">
      {scanning ? (
        <div className="reading-scan">
          <IsbnReader onIsbn={handleIsbn} startNow />
          <button className="link" onClick={() => setScanning(false)}>
            Cancel
          </button>
        </div>
      ) : found ? (
        <ScanFound found={found} readings={readings} onOpenBook={onOpenBook} onDone={() => setFound(null)} onScanAgain={() => {
          setFound(null)
          setScanning(true)
        }} />
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

// What a scan found: the copy (or copies) with that ISBN, each with its
// Reading section, so the same scan starts a book or finishes it.
function ScanFound({ found, readings, onOpenBook, onDone, onScanAgain }) {
  const { isbn, owned } = found
  return (
    <div className="reading-found">
      {owned.length === 0 ? (
        <p>ISBN {isbn} isn't in your library. Reading a borrowed book comes next.</p>
      ) : (
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
      )}
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
// A reading with no copy (a removed book) shows the title it kept.
function ReadingRow({ reading, copy, onOpenBook, children }) {
  const title = copy?.title ?? reading.title
  const byline = copy ? copy.byline : reading.author
  const when = reading && whenText(reading)
  const inside = (
    <>
      <span className="thumb">{copy && coverUrl(copy, 'M') && <img src={coverUrl(copy, 'M')} alt="" loading="lazy" />}</span>
      <span className="book-title">{title}</span>
      <span className="book-meta">{[byline, when].filter(Boolean).join(' · ')}</span>
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
