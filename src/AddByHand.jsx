import { useState } from 'react'
import { CheckBook } from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import { bookFromPick, searchByHand } from './handLookup.js'
import { listText } from './scanLookup.js'

const BLANK = { title: '', author: '', year: '' }

// One search result to pick: an LC edition or an Open Library work.
function Pick({ coverUrl, title, lines, onPick, disabled }) {
  return (
    <li>
      <button onClick={onPick} disabled={disabled}>
        <span className="thumb">{coverUrl && <img src={coverUrl} alt="" />}</span>
        <span className="book-title">{title}</span>
        {lines.filter(Boolean).map((line) => (
          <span key={line} className="book-meta">
            {line}
          </span>
        ))}
      </button>
    </li>
  )
}

// Add by hand, for a book with no ISBN or no record: search by title, author
// and year, pick the closest edition (or none), then the usual check form.
// `isbn` is set when a scanned book had no record; the new copy gets it.
// With `onAdded` (the shelf walk), a saved book goes straight to it as
// { id, warning } instead of to the Added screen.
function AddByHand({ isbn, copies, categories, acquired, addCopy, onOpenBook, onDone, onAdded, backLabel = 'Back to scanning' }) {
  const [typed, setTyped] = useState(BLANK)
  const [step, setStep] = useState('search') // search | pick | form | done
  const [search, setSearch] = useState(null)
  const [book, setBook] = useState(null)
  const [added, setAdded] = useState(null) // { id, title, warning }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const show = (next) => {
    setStep(next)
    window.scrollTo(0, 0)
  }
  const setTypedPart = (key) => (value) => setTyped((t) => ({ ...t, [key]: value }))

  async function runSearch(e) {
    e.preventDefault()
    if (!typed.title.trim()) return setError('Type at least the title.')
    if (typed.year.trim() && !/^\d{4}$/.test(typed.year.trim())) return setError('Year should be four digits, like 1952.')
    setBusy(true)
    setError('')
    try {
      setSearch(await searchByHand({ title: typed.title.trim(), author: typed.author.trim(), year: typed.year.trim() }))
      show('pick')
    } catch (err) {
      setError(`Couldn't search: ${err.message}`)
    }
    setBusy(false)
  }

  async function pick(choice) {
    setBusy(true)
    try {
      setBook(await bookFromPick(search, typed, choice))
      show('form')
    } finally {
      setBusy(false)
    }
  }

  // The book is saved; show it in the catalog, then say so.
  async function saved({ id, warning }) {
    if (onAdded) return onAdded({ id, warning })
    let title = book.title
    let problem = warning
    try {
      title = (await addCopy(id)).title
    } catch (err) {
      problem = [problem, `The app couldn't show it yet (${err.message}). Close and reopen the app to see it.`].filter(Boolean).join(' ')
    }
    setAdded({ id, title, warning: problem })
    show('done')
  }

  function startAgain() {
    setTyped(BLANK)
    setSearch(null)
    setBook(null)
    setAdded(null)
    show('search')
  }

  const header = (
    <div className="pinned-back">
      <button className="link" onClick={onDone}>
        ‹ {backLabel}
      </button>
      {isbn && <span className="book-meta"> · ISBN {isbn}</span>}
    </div>
  )

  if (step === 'done') {
    return (
      <div className="series-view">
        {header}
        <h2>Added</h2>
        <p>
          <strong>{added.title}</strong> is in your library.
        </p>
        {added.warning && <p className="scan-hint">{added.warning}</p>}
        <div className="review-actions">
          <button className="link" onClick={() => onOpenBook(added.id)}>
            Open it
          </button>
          <button className="primary" onClick={startAgain}>
            Add another by hand
          </button>
        </div>
      </div>
    )
  }

  if (step === 'form') {
    return (
      <div className="series-view">
        {header}
        <h2>Check and add</h2>
        <CheckBook
          book={book}
          isbn={isbn}
          manual
          copies={copies}
          categories={categories}
          acquired={acquired}
          onSaved={saved}
          onSkip={() => show('pick')}
          skipLabel="Back to results"
        />
      </div>
    )
  }

  if (step === 'pick') {
    const { editions, yearMatched, works, unreachable } = search
    return (
      <div className="series-view">
        {header}
        <h2>Pick the closest match</h2>
        {unreachable.length > 0 && <p className="scan-hint">{listText(unreachable)} didn't answer.</p>}
        {editions.length > 0 && (
          <>
            <h3>Library of Congress editions</h3>
            {typed.year && !yearMatched && (
              <p className="book-meta">LC has no edition from {typed.year}. These are from other years.</p>
            )}
            <ul className="book-list">
              {editions.map((edition, i) => (
                <Pick
                  key={i}
                  title={edition.subtitle ? `${edition.title}: ${edition.subtitle}` : edition.title}
                  lines={[
                    edition.authors.join(', '),
                    [edition.publisher, edition.year, edition.pages && `${edition.pages} pages`].filter(Boolean).join(' · '),
                    edition.edition,
                  ]}
                  onPick={() => pick({ edition })}
                  disabled={busy}
                />
              ))}
            </ul>
          </>
        )}
        {works.length > 0 && (
          <>
            <h3>Open Library</h3>
            <p className="book-meta">These cover every edition, so you'll type your copy's publisher and year.</p>
            <ul className="book-list">
              {works.map(({ doc, coverUrl }) => (
                <Pick
                  key={doc.key}
                  coverUrl={coverUrl}
                  title={doc.title}
                  lines={[
                    (doc.author_name ?? []).join(', '),
                    [doc.first_publish_year && `First published ${doc.first_publish_year}`, doc.edition_count && `${doc.edition_count} editions`].filter(Boolean).join(' · '),
                  ]}
                  onPick={() => pick({ work: doc })}
                  disabled={busy}
                />
              ))}
            </ul>
          </>
        )}
        {!editions.length && !works.length && <p className="placeholder">Nothing found for that search.</p>}
        <div className="review-actions">
          <button className="link" onClick={() => show('search')} disabled={busy}>
            Search again
          </button>
          <button className="primary" onClick={() => pick()} disabled={busy}>
            None of these: type it in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="series-view">
      {header}
      <h2>Add by hand</h2>
      <form className="edit-book" onSubmit={runSearch} noValidate>
        {error && <p className="error">{error}</p>}
        <Field label="Title" value={typed.title} onChange={setTypedPart('title')} />
        <Field label="Author (optional)" value={typed.author} onChange={setTypedPart('author')} />
        <Field label="Year printed in your copy (optional)" value={typed.year} onChange={setTypedPart('year')} numeric />
        <p className="book-meta">The year finds that edition in the Library of Congress catalog, which otherwise shows its 10 newest.</p>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
    </div>
  )
}

export default AddByHand
