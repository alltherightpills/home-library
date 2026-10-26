import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { toIsbn } from './isbn.js'

// Load the barcode engine from the app's own files instead of the internet,
// so scanning works offline.
setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
})

const detector = new BarcodeDetector({ formats: ['ean_13'] })

// How often to look at the camera picture for a barcode, in milliseconds.
const SCAN_INTERVAL = 150

const isHomeScreenApp =
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

function Scanner() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | starting | scanning | error
  const [error, setError] = useState('')
  const [scans, setScans] = useState([]) // most recent first

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function startCamera() {
    setStatus('starting')
    setError('')
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

  // While scanning, check the camera picture for a barcode every SCAN_INTERVAL.
  useEffect(() => {
    if (status !== 'scanning') return
    let timer
    let cancelled = false

    async function look() {
      try {
        const found = await detector.detect(videoRef.current)
        for (const barcode of found) {
          const isbn = toIsbn(barcode.rawValue)
          if (isbn) {
            // Ignore the same book being seen again right away.
            setScans((prev) =>
              prev[0]?.isbn === isbn ? prev : [{ isbn, time: new Date() }, ...prev],
            )
          }
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

      <h2>Scanned ISBNs</h2>
      {scans.length === 0 ? (
        <p className="placeholder">Point the camera at a book's barcode.</p>
      ) : (
        <ol className="scan-list">
          {scans.map((s) => (
            <li key={s.isbn + s.time.getTime()}>
              <strong>{s.isbn}</strong> <span>{s.time.toLocaleTimeString()}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="diagnostic">
        Running as: {isHomeScreenApp ? 'home-screen app' : 'Safari tab'}
      </p>
    </div>
  )
}

export default Scanner
