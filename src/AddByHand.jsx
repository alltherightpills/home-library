import { useState } from 'react'
import { CheckBook } from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import { listText } from './scanLookup.js'
import { useHandSearch } from './useHandSearch.js'

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

// The search boxes. `withYear` adds the year printed in your copy (not for a
// wish, which has no copy yet).
export function SearchStep({ hand, withYear = true }) {
  const { typed, setTypedPart, busy, error, runSearch } = hand
  return (
    <form className="edit-book" onSubmit={runSearch} noValidate>
      {error && <p className="error">{error}</p>}
      <Field label="Title" value={typed.title} onChange={setTypedPart('title')} />
      <Field label="Author (optional)" value={typed.author} onChange={setTypedPart('author')} />
      {withYear && (
        <>
          <Field label="Year printed in your copy (optional)" value={typed.year} onChange={setTypedPart('year')} numeric />
          <p className="book-meta">The year finds that edition in the Library of Congress catalog, which otherwise shows its 10 newest.</p>
        </>
      )}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}

// The results to pick from, then Search again or None of these.
export function PickStep({ hand, worksHint, noneLabel }) {
  const { typed, search, busy, show, pick } = hand
  const { editions, yearMatched, works, unreachable } = search
  return (
    <>
      <h2>Pick the closest match</h2>
      {unreachable.length > 0 && <p className="scan-hint">{listText(unreachable)} didn't answer.</p>}
      {editions.length > 0 && (
        <>
          <h3>Library of Congress editions</h3>
          {typed.year && !yearMatched && <p className="book-meta">LC has no edition from {typed.year}. These are from other years.</p>}
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
          <p className="book-meta">{worksHint}</p>
          <ul className="book-list">
            {works.map(({ doc, coverUrl }) => (
              <Pick
                key={doc.key}
                coverUrl={coverUrl}
                title={doc.title}
                lines={[
                  (doc.author_name ?? []).join(', '),
                  [doc.first_publish_year && `First published ${doc.first_publish_year}`, doc.edition_count && `${doc.edition_count} editions`]
                    .filter(Boolean)
                    .join(' · '),
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
          {noneLabel}
        </button>
      </div>
    </>
  )
}

// Add by hand, for a book with no ISBN or no record: search by title, author
// and year, pick the closest edition (or none), then the usual check form.
// `isbn` is set when a scanned book had no record; the new copy gets it.
// `initial` fills in the search boxes (I bought it, for a wish with no ISBN).
// With `onAdded` (the shelf walk), a saved book goes straight to it as
// { id, warning } instead of to the Added screen.
function AddByHand({ isbn, initial, copies, categories, acquired, wishlist, addCopy, onOpenBook, onDone, onAdded, backLabel = 'Back to scanning' }) {
  const hand = useHandSearch(initial)
  const { step, show, book } = hand
  const [added, setAdded] = useState(null) // { id, title, warning }

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
    setAdded(null)
    hand.reset()
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
          wishlist={wishlist}
          onSaved={saved}
          onSkip={() => show('pick')}
          skipLabel="Back to results"
        />
      </div>
    )
  }

  if (step === 'pick') {
    return (
      <div className="series-view">
        {header}
        <PickStep
          hand={hand}
          worksHint="These cover every edition, so you'll type your copy's publisher and year."
          noneLabel="None of these: type it in"
        />
      </div>
    )
  }

  return (
    <div className="series-view">
      {header}
      <h2>Add by hand</h2>
      <SearchStep hand={hand} />
    </div>
  )
}

export default AddByHand
