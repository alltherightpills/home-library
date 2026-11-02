import { useEffect, useRef, useState } from 'react'
import AddCheck from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import { acquiredText, loadAcquired, saveAcquired } from './addBook.js'
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { UPC_HINT, copiesWithIsbn, readTypedIsbn, toIsbn } from './isbn.js'
import { listText, lookUpNewBook, otherEditions } from './scanLookup.js'
import { coverUrl } from './useCatalog.js'

// Load the barcode engine from the app's own files instead of the internet,
// so scanning works offline.
setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
})

// Store (UPC) barcodes are read too, only to say they aren't the ISBN.
const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'upc_e'] })

// How often to look at the camera picture for a barcode, in milliseconds.
const SCAN_INTERVAL = 150

// `scans` lives in App, so the list survives a visit to a book page.
function Scanner({ copies, categories, scans, setScans, onOpenBook, addCopy }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | starting | scanning | error
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [typed, setTyped] = useState('')
  // The last code the camera read, so a barcode held in view counts once.
  const lastCode = useRef(null)
  // "New books saved as [year · place]", remembered on the phone.
  const [acquired, setAcquired] = useState(loadAcquired)
  const [changingAcquired, setChangingAcquired] = useState(false)
  // The ISBNs being checked and added, in scan order, or null on the scan screen.
  // The check screen is a step in the history, so swiping back returns here.
  const [checking, setChecking] = useState(null)

  useEffect(() => {
    const onPop = () => {
      if (!history.state?.checking) setChecking(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openCheck(queue) {
    stopCamera()
    setStatus('idle')
    history.pushState({ tab: 'scan', checking: true }, '')
    setChecking(queue)
    window.scrollTo(0, 0)
  }

  const markSkipped = (isbn) => setScans((prev) => prev.map((s) => (s.isbn === isbn ? { ...s, skipped: true } : s)))

  // New books waiting to be checked, oldest scan first, so they match the pile.
  const waiting = copies
    ? [...scans]
        .reverse()
        .filter((s) => !s.skipped && !copiesWithIsbn(copies, s.isbn).length)
        .filter((s) => s.lookup?.status === 'looking' || (s.lookup?.status === 'done' && s.lookup.book.found))
    : []

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function startCamera() {
    setStatus('starting')
    setError('')
    lastCode.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setStatus('scanning')
    } catch (err) {
      stopCamera()
      setStatus('error')
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access for this site in Settings, then try again.'
          : `Could not start the camera (${err.name}: ${err.message}).`,
      )
    }
  }

  // A book's ISBN-13, from the camera or the typing box. A book you own
  // opens straight away; with two copies, both are listed to pick from.
  function handleIsbn(isbn) {
    setHint('')
    const earlier = scans.find((s) => s.isbn === isbn)
    setScans((prev) => [{ ...earlier, isbn, time: new Date() }, ...prev.filter((s) => s.isbn !== isbn)])
    const owned = copies ? copiesWithIsbn(copies, isbn) : []
    if (owned.length === 1) {
      stopCamera()
      onOpenBook(owned[0].id)
    } else if (owned.length === 0 && !['looking', 'done'].includes(earlier?.lookup?.status)) {
      lookUp(isbn)
    }
  }

  // Looks up a book you don't own, showing progress in its row of the list.
  async function lookUp(isbn) {
    const setLookup = (lookup) => setScans((prev) => prev.map((s) => (s.isbn === isbn ? { ...s, lookup } : s)))
    setLookup({ status: 'looking' })
    try {
      setLookup({ status: 'done', book: await lookUpNewBook(isbn, copies?.[0]?.library_id) })
    } catch (err) {
      setLookup({ status: 'error', message: err.message })
    }
  }

  // The camera loop keeps running across screen updates, so it calls the
  // newest handleIsbn (which sees the newest catalog) through this ref.
  const handleIsbnRef = useRef(handleIsbn)
  useEffect(() => {
    handleIsbnRef.current = handleIsbn
  })

  // While scanning, check the camera picture for a barcode every SCAN_INTERVAL.
  useEffect(() => {
    if (status !== 'scanning') return
    let timer
    let cancelled = false

    async function look() {
      try {
        const found = await detector.detect(videoRef.current)
        for (const barcode of found) {
          if (barcode.rawValue === lastCode.current) continue
          lastCode.current = barcode.rawValue
          const isbn = toIsbn(barcode.rawValue)
          if (isbn) handleIsbnRef.current(isbn)
          else setHint(UPC_HINT)
        }
      } catch (err) {
        setStatus('error')
        setError(`The barcode reader failed (${err.name}: ${err.message}).`)
        return
      }
      if (!cancelled) timer = setTimeout(look, SCAN_INTERVAL)
    }

    look()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [status])

  // Turn the camera off when leaving the Scan tab.
  useEffect(() => stopCamera, [])

  function submitTyped(e) {
    e.preventDefault()
    const { isbn, problem } = readTypedIsbn(typed)
    if (problem) {
      setHint(problem)
      return
    }
    setTyped('')
    handleIsbn(isbn)
  }

  if (checking) {
    return (
      <AddCheck
        queue={checking}
        scans={scans}
        copies={copies}
        categories={categories}
        acquired={acquired}
        addCopy={addCopy}
        onSkipped={markSkipped}
        onDone={() => history.back()}
      />
    )
  }

  const setAcquiredPart = (key) => (value) => setAcquired((a) => ({ ...a, [key]: value }))

  return (
    <div className="scanner">
      {changingAcquired ? (
        <form
          className="edit-book acquired-form"
          onSubmit={(e) => {
            e.preventDefault()
            saveAcquired(acquired)
            setChangingAcquired(false)
          }}
        >
          <p>
            <strong>New books saved as</strong>
          </p>
          <div className="edit-pair">
            <Field label="Year acquired" value={acquired.year} onChange={setAcquiredPart('year')} numeric />
            <Field label="City" value={acquired.city} onChange={setAcquiredPart('city')} />
            <Field label="State / region" value={acquired.region} onChange={setAcquiredPart('region')} />
            <Field label="Country" value={acquired.country} onChange={setAcquiredPart('country')} />
          </div>
          <button className="primary" type="submit">
            Done
          </button>
        </form>
      ) : (
        <p className="acquired-line">
          New books saved as <strong>{acquiredText(acquired)}</strong> ·{' '}
          <button className="link" onClick={() => setChangingAcquired(true)}>
            Change
          </button>
        </p>
      )}

      <div className="viewfinder">
        <video ref={videoRef} playsInline muted />
        {status === 'scanning' && <div className="aim-box" />}
        {status !== 'scanning' && (
          <button className="primary" onClick={startCamera} disabled={status === 'starting'}>
            {status === 'starting' ? 'Starting…' : 'Start camera'}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <form className="typed-isbn" onSubmit={submitTyped}>
        <input
          className="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type an ISBN"
          aria-label="ISBN"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
        />
        <button className="primary" type="submit" disabled={!typed.trim()}>
          Find
        </button>
      </form>

      {hint && <p className="scan-hint">{hint}</p>}

      <h2>Scanned this session</h2>
      {waiting.length > 0 && (
        <button className="primary check-all" onClick={() => openCheck(waiting.map((s) => s.isbn))}>
          Check and add {waiting.length} {waiting.length === 1 ? 'book' : 'books'}
        </button>
      )}
      {copies === null && <p className="placeholder">Loading your books…</p>}
      {scans.length === 0 ? (
        <p className="placeholder">Point the camera at a book's barcode.</p>
      ) : (
        <ul className="book-list scan-results">
          {scans.map((s) => (
            <ScanResult
              key={s.isbn}
              scan={s}
              copies={copies}
              onOpenBook={onOpenBook}
              onRetry={() => lookUp(s.isbn)}
              onAdd={() => openCheck([s.isbn])}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// One scanned ISBN: the copies you own with it, or what the lookup found.
function ScanResult({ scan, copies, onOpenBook, onRetry, onAdd }) {
  const owned = copies ? copiesWithIsbn(copies, scan.isbn) : []
  if (owned.length > 0) {
    return owned.map((c) => (
      <OwnedRow key={c.id} copy={c} note={owned.length > 1 ? `You own ${owned.length} copies` : 'You own this'} onOpenBook={onOpenBook} />
    ))
  }
  const { status, book, message } = scan.lookup ?? {}
  if (status !== 'done' || !book.found) {
    return (
      <li className="scan-new">
        <strong>{scan.isbn}</strong>
        {status === 'looking' && <span className="book-meta">Not in your library. Looking it up…</span>}
        {status === 'done' && (
          <span className="book-meta">
            Not in your library, and no record found in Open Library or Google Books
            {book.unreachable.length ? ` (${listText(book.unreachable)} didn't answer)` : ''}.
          </span>
        )}
        {status === 'error' && (
          <span className="book-meta">
            Not in your library. Couldn't look it up: check your connection. ({message}){' '}
            <button className="link" onClick={onRetry}>
              Try again
            </button>
          </span>
        )}
        {!status && <span className="book-meta">{copies ? 'Not in your library' : 'Checking…'}</span>}
      </li>
    )
  }
  const others = copies ? otherEditions(copies, book) : []
  return (
    <li className="scan-found">
      <div className="scan-preview">
        <span className="thumb large">{book.coverUrl && <img src={book.coverUrl} alt="" />}</span>
        <div>
          <p className="book-title">
            {book.title}
            {book.subtitle && <span className="scan-subtitle">: {book.subtitle}</span>}
          </p>
          {book.authors.length > 0 && <p>{book.authors.join(', ')}</p>}
          <p className="book-meta">
            {[book.publisher, book.year, book.pages && `${book.pages} pages`].filter(Boolean).join(' · ')}
          </p>
          {book.firstPublished && book.firstPublished !== book.year && (
            <p className="book-meta">First published {book.firstPublished}</p>
          )}
          <p className="book-meta">
            ISBN {scan.isbn} · from {listText(book.sources)}
            {book.unreachable.length ? ` (${listText(book.unreachable)} didn't answer)` : ''}
          </p>
          {copies && (
            <button className="link strong" onClick={onAdd}>
              {others.length ? 'Add this one too' : 'Add to library'}
            </button>
          )}
          {scan.skipped && <span className="book-meta"> · skipped</span>}
        </div>
      </div>
      {others.length > 0 && (
        <div className="scan-editions">
          <p>
            <strong>You own {others.length === 1 ? 'another edition' : `${others.length} other editions`}:</strong>
          </p>
          <ul className="book-list">
            {others.map((c) => (
              <OwnedRow key={c.id} copy={c} note="Open my copy" onOpenBook={onOpenBook} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

// A copy you own, as in the main list, with a note before its gray line.
function OwnedRow({ copy, note, onOpenBook }) {
  return (
    <li>
      <button onClick={() => onOpenBook(copy.id)}>
        <span className="thumb">{coverUrl(copy, 'M') && <img src={coverUrl(copy, 'M')} alt="" />}</span>
        <span className="book-title">{copy.title}</span>
        <span className="book-meta">
          {note} · {copy.listLine}
        </span>
      </button>
    </li>
  )
}

export default Scanner
