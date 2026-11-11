import { useEffect, useRef, useState } from 'react'
import AddByHand from './AddByHand.jsx'
import AddCheck from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import IsbnReader from './IsbnReader.jsx'
import { acquiredText, loadAcquired, saveAcquired } from './addBook.js'
import { copiesWithIsbn } from './isbn.js'
import { listText, lookUpNewBook, otherEditions } from './scanLookup.js'
import { coverUrl } from './useCatalog.js'
import { needsLookup } from './scanQueue.js'
import { wishesForBook } from './wishlist.js'

// `scans` lives in App, so the list survives a visit to a book page.
// The camera turns off whenever IsbnReader leaves the screen (the check form,
// Add by hand, or another tab).
// `buying` is a wish from the Wishlist screen's I bought it. One with an ISBN
// is taken as a scan and its check form opens straight away. One without
// (added by title) asks for the copy's barcode, and No ISBN? Add by hand
// opens with its title and author typed in.
// A scan whose lookup can't happen (no signal) joins the scan queue
// (scanQueue.js): kept on the phone, looked up when Scan is open with signal
// (on opening, and again on `refreshTick`, which changes when signal returns).
function Scanner({ copies, lentTo, wishlist, categories, scans, setScans, onOpenBook, addCopy, buying, onBuyingStarted, refreshTick }) {
  // "New books saved as [year · place]", remembered on the phone.
  const [acquired, setAcquired] = useState(loadAcquired)
  const [changingAcquired, setChangingAcquired] = useState(false)
  // The ISBNs being checked and added, in scan order, or null on the scan screen.
  // The check screen is a step in the history, so swiping back returns here.
  const [checking, setChecking] = useState(null)
  // Add by hand, likewise a step in the history: { isbn } (null for a book with
  // no ISBN), or null when not showing.
  const [byHand, setByHand] = useState(null)
  // I bought it for a wish with no ISBN: the wish, while it's still on the
  // wishlist (adding the book takes it off, and the line goes).
  const [buyingWish] = useState(() => (buying && !buying.isbn13 ? buying : null))
  const stillWished = buyingWish && wishlist.list?.some((w) => w.id === buyingWish.id)

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

  // `initial`: the search boxes filled in, for I bought it.
  function openByHand(isbn = null, initial = undefined) {
    history.pushState({ tab: 'scan', byHand: true }, '')
    setByHand({ isbn, initial })
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

  // A book's ISBN-13, from the camera or the typing box. A book you own goes
  // to the top of the list with Open my copy and Add another copy (owner's
  // choice, 2026-11-10: it used to open the book page straight away).
  function handleIsbn(isbn) {
    const earlier = scans.find((s) => s.isbn === isbn)
    setScans((prev) => [{ ...earlier, isbn, time: new Date() }, ...prev.filter((s) => s.isbn !== isbn)])
    const owned = copies ? copiesWithIsbn(copies, isbn) : []
    if (owned.length === 0 && !['looking', 'done'].includes(earlier?.lookup?.status)) lookUp(isbn)
  }

  // Add another copy of a book you own: looked up like a new book (only now,
  // so scanning your own books costs no lookups), then the check form, which
  // starts from the copy you own. With no record found, Add by hand instead.
  function addAnotherCopy(isbn) {
    const scan = scans.find((s) => s.isbn === isbn)
    setScans((prev) => prev.map((s) => (s.isbn === isbn ? { ...s, extraCopy: true } : s)))
    const { status, book } = scan?.lookup ?? {}
    if (status === 'done' && !book.found) return openByHand(isbn)
    if (!['looking', 'done'].includes(status)) lookUp(isbn)
    openCheck([isbn])
  }

  // From the check form when no record was found: Add by hand takes the check
  // form's place in the history, so swiping back returns to the scan list.
  function checkToByHand(isbn) {
    history.replaceState({ tab: 'scan', byHand: true }, '')
    setChecking(null)
    setByHand({ isbn, initial: undefined })
    window.scrollTo(0, 0)
  }

  // I bought it: scan the wished-for edition, then open its check form (which
  // waits for the lookup). Owned already, it shows in the list with its
  // Open my copy and Add another copy buttons instead.
  // (A wish with no ISBN only needs `buyingWish`, above.)
  // `started` stops a second run (React's development mode runs effects twice).
  const started = useRef(null)
  useEffect(() => {
    if (!buying || !copies || started.current === buying) return
    started.current = buying
    onBuyingStarted()
    const isbn = buying.isbn13
    if (!isbn) return
    handleIsbn(isbn)
    if (!copiesWithIsbn(copies, isbn).length) openCheck([isbn])
    // Runs once per I bought it; the functions it calls change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buying, copies])

  // Looks up a book you don't own, showing progress in its row of the list.
  // With no signal it joins the queue instead (without trying, when the phone
  // knows it's offline; otherwise when the lookup fails).
  async function lookUp(isbn) {
    const setScan = (changes) => setScans((prev) => prev.map((s) => (s.isbn === isbn ? { ...s, ...changes } : s)))
    if (navigator.onLine === false) return setScan({ queued: true, lookup: { status: 'waiting' } })
    setScan({ lookup: { status: 'looking' } })
    try {
      setScan({ lookup: { status: 'done', book: await lookUpNewBook(isbn, copies?.[0]?.library_id) } })
    } catch (err) {
      setScan({ queued: true, lookup: { status: 'error', message: err.message } })
    }
  }

  const removeScan = (isbn) => setScans((prev) => prev.filter((s) => s.isbn !== isbn))

  // The queue's lookups, once the catalog is in (a book added meanwhile is
  // left alone) and there's signal.
  useEffect(() => {
    if (!copies || navigator.onLine === false) return
    for (const s of scans) if (needsLookup(s) && !copiesWithIsbn(copies, s.isbn).length) lookUp(s.isbn)
    // Runs on opening Scan, when the catalog arrives, and on each refresh; the
    // scans and functions it reads change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, Boolean(copies)])

  if (byHand) {
    return (
      <AddByHand
        isbn={byHand.isbn}
        initial={byHand.initial}
        copies={copies}
        categories={categories}
        acquired={acquired}
        wishlist={wishlist}
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
        wishlist={wishlist}
        addCopy={addCopy}
        onSkipped={markSkipped}
        onAddByHand={checkToByHand}
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

      {stillWished && (
        <p className="on-wishlist">
          ★ Scan the barcode of your copy of <strong>{buyingWish.title}</strong>. No barcode? Tap Add by hand under the camera.
        </p>
      )}

      <IsbnReader onIsbn={handleIsbn}>
        {copies && (
          <p className="by-hand-link">
            <button
              className="link"
              onClick={() =>
                stillWished
                  ? openByHand(null, { title: buyingWish.title, author: buyingWish.authors[0] ?? '', year: '' })
                  : openByHand()
              }
            >
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
              lentTo={lentTo}
              wishlist={wishlist}
              onOpenBook={onOpenBook}
              onRetry={() => lookUp(s.isbn)}
              onAdd={() => openCheck([s.isbn])}
              onAddByHand={() => openByHand(s.isbn)}
              onAddAnother={() => addAnotherCopy(s.isbn)}
              onRemove={() => removeScan(s.isbn)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// One scanned ISBN: the copies you own with it, or what the lookup found.
// A queued scan (kept for want of signal) has Remove, until it's added.
function ScanResult({ scan, copies, lentTo, wishlist, onOpenBook, onRetry, onAdd, onAddByHand, onAddAnother, onRemove }) {
  const owned = copies ? copiesWithIsbn(copies, scan.isbn) : []
  if (owned.length > 0) {
    return (
      <>
        {owned.map((c) => (
          <OwnedRow key={c.id} copy={c} lent={lentTo.get(c.id)} note={owned.length > 1 ? `You own ${owned.length} copies` : 'You own this'} onOpenBook={onOpenBook} />
        ))}
        <li className="scan-owned-actions">
          {/* With two or more copies, tapping a row above opens that one. */}
          <div className="button-pair">
            {owned.length === 1 && (
              <button className="primary" onClick={() => onOpenBook(owned[0].id)}>
                Open my copy
              </button>
            )}
            <button className="secondary" onClick={onAddAnother}>
              Add another copy
            </button>
          </div>
        </li>
      </>
    )
  }
  const remove = scan.queued && (
    <button className="link" onClick={onRemove}>
      Remove
    </button>
  )
  const { status, book, message } = scan.lookup ?? {}
  if (status !== 'done' || !book.found) {
    // With no lookup, only this exact ISBN can be matched to the wishlist.
    const wished = wishlist.list?.find((w) => w.isbn13 === scan.isbn)
    const waiting = scan.queued && (!status || status === 'waiting' || status === 'error')
    return (
      <li className="scan-new">
        <strong>{scan.isbn}</strong>
        {wished && (
          <span className="book-meta on-wishlist">
            ★ On your wishlist: {wished.title}
            {wished.note ? ` · ${wished.note}` : ''}
          </span>
        )}
        {waiting && (
          <span className="book-meta">
            Not in your library. Waiting for signal: it’s looked up when you’re back online.{' '}
            {status === 'error' && (
              <>
                <button className="link" onClick={onRetry}>
                  Try again
                </button>{' '}
                ·{' '}
              </>
            )}
            {remove}
          </span>
        )}
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
            {remove && <> · {remove}</>}
          </span>
        )}
        {status === 'error' && !waiting && (
          <span className="book-meta">
            Not in your library. Couldn't look it up: check your connection. ({message}){' '}
            <button className="link" onClick={onRetry}>
              Try again
            </button>
          </span>
        )}
        {!status && !waiting && <span className="book-meta">{copies ? 'Not in your library' : 'Checking…'}</span>}
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
          {scan.skipped && <p className="book-meta">Skipped</p>}
          {remove && !scan.skipped && <p className="book-meta">Scanned with no signal · {remove}</p>}
        </div>
      </div>
      {copies && (
        <ScanActions
          addLabel={others.length ? 'Add this one too' : 'Add to library'}
          onAdd={onAdd}
          book={book}
          isbn={scan.isbn}
          wishlist={wishlist}
          libraryId={copies[0]?.library_id}
        />
      )}
      {others.length > 0 && (
        <div className="scan-editions">
          <p>
            <strong>You own {others.length === 1 ? 'another edition' : `${others.length} other editions`}:</strong>
          </p>
          <ul className="book-list">
            {others.map((c) => (
              <OwnedRow key={c.id} copy={c} lent={lentTo.get(c.id)} note="Open my copy" onOpenBook={onOpenBook} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

// A found book's buttons, side by side under it: Add to library and Add to
// wishlist. Add to wishlist opens a note box (optional) with Save to wishlist
// and Cancel. A book already on the wishlist says so instead of offering it.
function ScanActions({ addLabel, onAdd, book, isbn, wishlist, libraryId }) {
  const [note, setNote] = useState(null) // the note box's text while adding; null when closed
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // No title (rare): nothing to put on the wishlist.
  const canWish = Boolean(book.title && wishlist.list)
  // A wish for this book in any edition; this exact edition's comes first.
  const wish = wishesForBook(wishlist.list, book, isbn)[0]

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await wishlist.add(book, isbn, note, libraryId)
      setNote(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scan-actions">
      {note === null ? (
        <div className="button-pair">
          <button className="primary" onClick={onAdd}>
            {addLabel}
          </button>
          {canWish && !wish && (
            <button className="secondary" onClick={() => (setError(''), setNote(''))}>
              Add to wishlist
            </button>
          )}
        </div>
      ) : (
        // edit-book: the shared form look, with 16px text so the iPhone doesn't zoom.
        <form className="edit-book wish-form" onSubmit={save}>
          <Field label="Note (optional)" value={note} onChange={setNote} />
          <div className="button-pair">
            <button className="primary" type="submit" disabled={busy}>
              Save to wishlist
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => (setError(''), setNote(null))}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {wish && (
        <p className="book-meta on-wishlist">
          {wish.isbn13 === isbn ? '★ On your wishlist' : `★ Another edition is on your wishlist: ${wish.title}`}
          {wish.note ? ` · ${wish.note}` : ''}
        </p>
      )}
      {wishlist.error && <p className="error">Couldn't load the wishlist: {wishlist.error}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// A copy you own, as in the main list, with a note before its gray line, and
// who has it if it's lent out (`lent`: { name }).
function OwnedRow({ copy, note, lent, onOpenBook }) {
  return (
    <li>
      <button onClick={() => onOpenBook(copy.id)}>
        <span className="thumb">{coverUrl(copy, 'M') && <img src={coverUrl(copy, 'M')} alt="" />}</span>
        <span className="book-title">{copy.title}</span>
        <span className="book-meta">
          {[note, lent && `lent to ${lent.name}`, copy.listLine].filter(Boolean).join(' · ')}
        </span>
      </button>
    </li>
  )
}

export default Scanner
