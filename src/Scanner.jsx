import { useEffect, useState } from 'react'
import AddByHand from './AddByHand.jsx'
import AddCheck from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import IsbnReader from './IsbnReader.jsx'
import { acquiredText, loadAcquired, saveAcquired } from './addBook.js'
import { copiesWithIsbn } from './isbn.js'
import { listText, lookUpNewBook, otherEditions } from './scanLookup.js'
import { coverUrl } from './useCatalog.js'

// `scans` lives in App, so the list survives a visit to a book page.
// The camera turns off whenever IsbnReader leaves the screen (the check form,
// Add by hand, or another tab).
function Scanner({ copies, categories, scans, setScans, onOpenBook, addCopy }) {
  // "New books saved as [year · place]", remembered on the phone.
  const [acquired, setAcquired] = useState(loadAcquired)
  const [changingAcquired, setChangingAcquired] = useState(false)
  // The ISBNs being checked and added, in scan order, or null on the scan screen.
  // The check screen is a step in the history, so swiping back returns here.
  const [checking, setChecking] = useState(null)
  // Add by hand, likewise a step in the history: { isbn } (null for a book with
  // no ISBN), or null when not showing.
  const [byHand, setByHand] = useState(null)

  useEffect(() => {
    const onPop = () => {
      if (!history.state?.checking) setChecking(null)
      if (!history.state?.byHand) setByHand(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openCheck(queue) {
    history.pushState({ tab: 'scan', checking: true }, '')
    setChecking(queue)
    window.scrollTo(0, 0)
  }

  function openByHand(isbn = null) {
    history.pushState({ tab: 'scan', byHand: true }, '')
    setByHand({ isbn })
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

  // A book's ISBN-13, from the camera or the typing box. A book you own
  // opens straight away; with two copies, both are listed to pick from.
  function handleIsbn(isbn) {
    const earlier = scans.find((s) => s.isbn === isbn)
    setScans((prev) => [{ ...earlier, isbn, time: new Date() }, ...prev.filter((s) => s.isbn !== isbn)])
    const owned = copies ? copiesWithIsbn(copies, isbn) : []
    if (owned.length === 1) {
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

  if (byHand) {
    return (
      <AddByHand
        isbn={byHand.isbn}
        copies={copies}
        categories={categories}
        acquired={acquired}
        addCopy={addCopy}
        onOpenBook={onOpenBook}
        onDone={() => history.back()}
      />
    )
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

      <IsbnReader onIsbn={handleIsbn}>
        {copies && (
          <p className="by-hand-link">
            <button className="link" onClick={() => openByHand()}>
              No ISBN? Add by hand
            </button>
          </p>
        )}
      </IsbnReader>

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
              onAddByHand={() => openByHand(s.isbn)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// One scanned ISBN: the copies you own with it, or what the lookup found.
function ScanResult({ scan, copies, onOpenBook, onRetry, onAdd, onAddByHand }) {
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
            {book.unreachable.length ? ` (${listText(book.unreachable)} didn't answer)` : ''}.{' '}
            {copies && (
              <button className="link strong" onClick={onAddByHand}>
                Add by hand
              </button>
            )}
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
