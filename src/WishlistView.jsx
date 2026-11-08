import { useState } from 'react'
import { BackBar } from './CategoryView.jsx'
import { dateText } from './dates.js'
import { Field } from './EditBook.jsx'
import { copiesForWish, newestFirst } from './wishlist.js'

// The dashboard's Wishlist screen: books the household wants, newest first,
// each with Edit note and Remove. Its own list, never counted in the library.
function WishlistView({ wishlist, copies, onBuy, onOpenBook, onBack }) {
  const [editingId, setEditingId] = useState(null)
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Library" />
      <h2>Wishlist</h2>
      {wishlist.error ? (
        <p className="error">Couldn't load the wishlist: {wishlist.error}</p>
      ) : !wishlist.list ? (
        <p className="placeholder">Loading…</p>
      ) : wishlist.list.length === 0 ? (
        <p className="book-meta">Nothing yet. Scan a book you don't own and tap Add to wishlist.</p>
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
            wish.isbn13 && (
              <button className="primary" disabled={busy} onClick={() => onBuy(wish.isbn13)}>
                I bought it
              </button>
            )
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

export default WishlistView
