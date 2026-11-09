import { useState } from 'react'
import { PickStep, SearchStep } from './AddByHand.jsx'
import { BackBar } from './CategoryView.jsx'
import { dateText } from './dates.js'
import { Field } from './EditBook.jsx'
import { useHandSearch } from './useHandSearch.js'
import { copiesForWish, newestFirst, wishesForBook } from './wishlist.js'

// The dashboard's Wishlist screen: books the household wants, newest first,
// each with Edit note and Remove. Its own list, never counted in the library.
// `onAdd` opens Add a book by title (for a book with no barcode to scan).
function WishlistView({ wishlist, copies, onBuy, onOpenBook, onAdd, onBack }) {
  const [editingId, setEditingId] = useState(null)
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Library" />
      <h2>Wishlist</h2>
      {wishlist.list && (
        <p>
          <button className="link strong" onClick={onAdd}>
            + Add a book by title
          </button>
        </p>
      )}
      {wishlist.error ? (
        <p className="error">Couldn't load the wishlist: {wishlist.error}</p>
      ) : !wishlist.list ? (
        <p className="placeholder">Loading…</p>
      ) : wishlist.list.length === 0 ? (
        <p className="book-meta">Nothing yet. Scan a book you don't own and tap Add to wishlist, or add one by title.</p>
      ) : (
        <ul className="reading-list">
          {newestFirst(wishlist.list).map((w) => (
            <WishRow
              key={w.id}
              wish={w}
              wishlist={wishlist}
              owned={copiesForWish(w, copies)}
              editing={editingId === w.id}
              onEdit={setEditingId}
              onBuy={onBuy}
              onOpenBook={onOpenBook}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// `owned`: copies in the library the wish matches (any edition), shown as
// "You own this now" in place of I bought it.
function WishRow({ wish, wishlist, owned, editing, onEdit, onBuy, onOpenBook }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    if (await run(() => wishlist.setNote(wish, note))) onEdit(null)
  }

  return (
    <li>
      <div className="reading-book">
        <span className="thumb">{wish.cover_url && <img src={wish.cover_url} alt="" loading="lazy" />}</span>
        <span className="book-title">{wish.title}</span>
        <span className="book-meta">{[wish.authors.join(', '), `added ${dateText(wish.added_on)}`].filter(Boolean).join(' · ')}</span>
        {wish.note && !editing && <span className="wish-note">{wish.note}</span>}
      </div>
      {editing ? (
        // edit-book: the shared form look, with 16px text so the iPhone doesn't zoom.
        <form className="edit-book wish-form" onSubmit={save}>
          <Field label="Note" value={note} onChange={setNote} />
          <div className="button-pair">
            <button className="primary" type="submit" disabled={busy}>
              Save
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => (setError(''), onEdit(null))}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="reading-actions">
          {owned.length > 0 ? (
            <button className="link strong" onClick={() => onOpenBook(owned[0].id)}>
              You own this now ›
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => onBuy(wish)}>
              I bought it
            </button>
          )}
          <button className="link" disabled={busy} onClick={() => (setNote(wish.note ?? ''), setError(''), onEdit(wish.id))}>
            {wish.note ? 'Edit note' : 'Add a note'}
          </button>
          <button
            className="link"
            disabled={busy}
            onClick={() => confirm(`Take “${wish.title}” off the wishlist?`) && run(() => wishlist.remove(wish))}
          >
            Remove
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  )
}

// Add a book by title: Add by hand's search and pick, then the book with a
// note box and Save to wishlist. Such a wish has no ISBN (a search result is
// a book, not one printing of it), but usually Open Library's work id, so Scan
// still notices any edition of it later. Saving returns to the Wishlist.
export function WishAdd({ wishlist, copies, onOpenBook, onDone }) {
  const hand = useHandSearch()
  const { step, show, book } = hand
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const header = <BackBar onBack={onDone} label="Wishlist" />

  if (step === 'search') {
    return (
      <div className="series-view">
        {header}
        <h2>Add a book by title</h2>
        <SearchStep hand={hand} withYear={false} />
      </div>
    )
  }
  if (step === 'pick') {
    return (
      <div className="series-view">
        {header}
        <PickStep hand={hand} worksHint="These cover every edition." noneLabel="None of these: save what I typed" />
      </div>
    )
  }

  // Already wished for (any edition), or already owned: said, so it isn't
  // added twice by mistake. Owned still lets it be saved (another edition, say).
  const already = wishesForBook(wishlist.list, book, null)[0]
  const owned = copiesForWish({ title: book.title, authors: book.authors, isbn13: null, work_key: book.workKey }, copies)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await wishlist.add(book, null, note, copies?.[0]?.library_id)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="series-view">
      {header}
      <h2>Add to wishlist</h2>
      <div className="scan-preview">
        <span className="thumb large">{book.coverUrl && <img src={book.coverUrl} alt="" />}</span>
        <div>
          <p className="book-title">
            {book.title}
            {book.subtitle && <span className="scan-subtitle">: {book.subtitle}</span>}
          </p>
          {book.authors.length > 0 && <p>{book.authors.join(', ')}</p>}
          {book.firstPublished && <p className="book-meta">First published {book.firstPublished}</p>}
        </div>
      </div>
      {already ? (
        <>
          <p className="book-meta on-wishlist">
            ★ Already on your wishlist{already.title !== book.title ? `: ${already.title}` : ''}
            {already.note ? ` · ${already.note}` : ''}
          </p>
          <div className="review-actions">
            <button className="link" onClick={() => show('pick')}>
              Back to results
            </button>
          </div>
        </>
      ) : (
        // edit-book: the shared form look, with 16px text so the iPhone doesn't zoom.
        <form className="edit-book wish-form" onSubmit={save}>
          {owned.length > 0 && (
            <p className="book-meta">
              You already own {owned.length === 1 ? 'a copy' : `${owned.length} copies`}.{' '}
              <button type="button" className="link" onClick={() => onOpenBook(owned[0].id)}>
                Open it ›
              </button>
            </p>
          )}
          <Field label="Note (optional)" value={note} onChange={setNote} />
          <div className="button-pair">
            <button className="primary" type="submit" disabled={busy}>
              Save to wishlist
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => (setError(''), show('pick'))}>
              Back to results
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default WishlistView
