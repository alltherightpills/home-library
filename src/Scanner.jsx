import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { UPC_HINT, copiesWithIsbn, readTypedIsbn, toIsbn } from './isbn.js'
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
    setScans((prev) => [{ isbn, time: new Date() }, ...prev.filter((s) => s.isbn !== isbn)])
    const owned = copies ? copiesWithIsbn(copies, isbn) : []
    if (owned.length === 1) {
      stopCamera()
      onOpenBook(owned[0].id)
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
            <ScanResult key={s.isbn} scan={s} copies={copies} onOpenBook={onOpenBook} />
          ))}
        </ul>
      )}
    </div>
  )
}

// One scanned ISBN: the copies you own with it, or a note that it's new.
function ScanResult({ scan, copies, onOpenBook }) {
  const owned = copies ? copiesWithIsbn(copies, scan.isbn) : []
  if (owned.length === 0) {
    return (
      <li className="scan-new">
        <strong>{scan.isbn}</strong>
        <span className="book-meta">{copies ? 'Not in your library' : 'Checking…'}</span>
      </li>
    )
  }
  return owned.map((c) => (
    <li key={c.id}>
      <button onClick={() => onOpenBook(c.id)}>
        <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" />}</span>
        <span className="book-title">{c.title}</span>
        <span className="book-meta">
          {owned.length > 1 ? `You own ${owned.length} copies · ` : 'You own this · '}
          {c.listLine}
        </span>
      </button>
    </li>
  ))
}

export default Scanner
