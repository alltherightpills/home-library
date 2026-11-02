import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { UPC_HINT, readTypedIsbn, toIsbn } from './isbn.js'

// Load the barcode engine from the app's own files instead of the internet,
// so scanning works offline.
setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
})

// Store (UPC) barcodes are read too, only to say they aren't the ISBN.
const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'upc_e'] })

// How often to look at the camera picture for a barcode, in milliseconds.
const SCAN_INTERVAL = 150

// The camera and the "type an ISBN" box, shared by the Scan and Reading tabs.
// Calls onIsbn with an ISBN-13 for each book read. `children` go between the
// typing box and the hint. The camera turns off when this leaves the screen.
function IsbnReader({ onIsbn, startNow = false, children }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState(startNow ? 'starting' : 'idle') // idle | starting | scanning | error
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [typed, setTyped] = useState('')
  // The last code the camera read, so a barcode held in view counts once.
  const lastCode = useRef(null)
  // False once this has left the screen, so a camera still starting up then is turned off.
  const showing = useRef(true)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function startCamera() {
    setStatus('starting')
    setError('')
    lastCode.current = null
    openCamera()
  }

  async function openCamera() {
    // Safari only offers the camera on a secure (https) address or localhost,
    // so not on the Mac's test server opened from the phone.
    if (!navigator.mediaDevices) {
      setStatus('error')
      setError("The camera only works on a secure (https) address, like the live app. Type the ISBN below instead.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (!showing.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
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

  // The camera loop keeps running across screen updates, so it calls the
  // newest onIsbn (which sees the newest catalog) through this ref.
  const onIsbnRef = useRef(onIsbn)
  useEffect(() => {
    onIsbnRef.current = onIsbn
  })

  function found(isbn) {
    setHint('')
    onIsbnRef.current(isbn)
  }

  // While scanning, check the camera picture for a barcode every SCAN_INTERVAL.
  useEffect(() => {
    if (status !== 'scanning') return
    let timer
    let cancelled = false

    async function look() {
      try {
        const codes = await detector.detect(videoRef.current)
        for (const barcode of codes) {
          if (barcode.rawValue === lastCode.current) continue
          lastCode.current = barcode.rawValue
          const isbn = toIsbn(barcode.rawValue)
          if (isbn) found(isbn)
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

  // Start right away if asked (the Reading tab's Scan button), and turn the
  // camera off when leaving.
  useEffect(() => {
    showing.current = true
    if (startNow) openCamera()
    return () => {
      showing.current = false
      stopCamera()
    }
  }, [startNow])

  function submitTyped(e) {
    e.preventDefault()
    const { isbn, problem } = readTypedIsbn(typed)
    if (problem) {
      setHint(problem)
      return
    }
    setTyped('')
    found(isbn)
  }

  return (
    <>
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

      {children}

      {hint && <p className="scan-hint">{hint}</p>}
    </>
  )
}

export default IsbnReader
