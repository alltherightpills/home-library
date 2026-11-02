import { useState } from 'react'
import { hasRead, readingText, readingsOf } from './readings.js'

// The book page's Reading section: start, finish or set aside, and this
// person's reading history of the copy.
function BookReading({ copy, readings }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (readings.error) return <p className="error">Couldn't load your reading: {readings.error}</p>
  if (!readings.list) return null

  const mine = readingsOf(readings.list, copy.id)
  const current = mine.find((r) => r.status === 'reading')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="book-reading">
      <h3>Reading</h3>
      <div className="reading-actions">
        {current ? (
          <>
            <button className="primary" disabled={busy} onClick={() => run(() => readings.end(current, 'finished'))}>
              Finished
            </button>
            <button className="link" disabled={busy} onClick={() => run(() => readings.end(current, 'set_aside'))}>
              Set aside
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => run(() => readings.start(copy))}>
              {mine.length ? 'Start reading again' : 'Start reading'}
            </button>
            {!hasRead(mine) && (
              <button className="link" disabled={busy} onClick={() => run(() => readings.markRead(copy))}>
                I've read this before
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {copy.read && !hasRead(mine) && <p className="book-meta">You've read another copy of this book.</p>}
      {mine.length > 0 && (
        <ul className="reading-history">
          {mine.map((r) => (
            <li key={r.id}>
              {readingText(r)}{' '}
              <button
                className="link"
                disabled={busy}
                onClick={() => confirm('Remove this from your reading history?') && run(() => readings.remove(r))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default BookReading
