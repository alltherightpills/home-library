import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { UPC_HINT, copiesWithIsbn, readTypedIsbn, toIsbn } from './isbn.js'
import { lookUpNewBook, otherEditions } from './scanLookup.js'
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
function Scanner({ copies, scans, setScans, onOpenBook }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | starting | scanning | error
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [typed, setTyped] = useState('')
  // The last code the camera read, so a barcode held in view counts once.
  const lastCode = useRef(null)

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

  return (
    <div className="scanner">
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
      {copies === null && <p className="placeholder">Loading your books…</p>}
      {scans.length === 0 ? (
        <p className="placeholder">Point the camera at a book's barcode.</p>
      ) : (
        <ul className="book-list scan-results">
          {scans.map((s) => (
            <ScanResult key={s.isbn} scan={s} copies={copies} onOpenBook={onOpenBook} onRetry={() => lookUp(s.isbn)} />
          ))}
        </ul>
      )}
    </div>
  )
}

// One scanned ISBN: the copies you own with it, or what the lookup found.
function ScanResult({ scan, copies, onOpenBook, onRetry }) {
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
            {book.unreachable.length ? ` (${book.unreachable.join(' and ')} didn't answer)` : ''}.
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
            ISBN {scan.isbn} · from {book.sources.join(' and ')}
            {book.unreachable.length ? ` (${book.unreachable.join(' and ')} didn't answer)` : ''}
          </p>
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
