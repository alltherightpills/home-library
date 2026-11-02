import { useMemo, useState } from 'react'
import { Field, LabelRows, TitleField } from './EditBook.jsx'
import { addProblem, authorMatches, authorsIn, formFromLookup, saveNewBook } from './addBook.js'
import { nameParts } from './bookEdits.js'
import { copiesWithIsbn } from './isbn.js'
import { otherEditions } from './scanLookup.js'
import { labelNames } from './series.js'

const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))

// Under a typed name: whether that person is already in the library, and others
// with the same last name to pick instead.
function AuthorNote({ authors, person, onUse }) {
  const { exact, similar } = authorMatches(authors, person)
  if (!person.last.trim()) return null
  return (
    <div className="add-author-note">
      {exact ? <span>✓ Already in your library</span> : <span>New to your library</span>}
      {similar.map((a) => (
        <span key={a.id}>
          {' '}
          · You have <strong>{a.sort_name}</strong>.{' '}
          <button type="button" className="link" onClick={() => onUse(nameParts(a.sort_name))}>
            Same person
          </button>
        </span>
      ))}
    </div>
  )
}

// The check form for one book. onSaved gets { id, warning } once the book is in the database.
function CheckBook({ scan, copies, acquired, onSaved, onSkip }) {
  const book = scan.lookup.book
  const others = useMemo(() => otherEditions(copies, book), [copies, book])
  const seriesNames = useMemo(() => labelNames(copies, 'series'), [copies])
  const publisherSeriesNames = useMemo(() => labelNames(copies, 'publisherSeries'), [copies])
  const authors = useMemo(() => authorsIn(copies), [copies])
  const places = useMemo(
    () => ({
      city: distinct(copies.map((c) => c.acquired_city)),
      region: distinct(copies.map((c) => c.acquired_region)),
      country: distinct(copies.map((c) => c.acquired_country)),
    }),
    [copies],
  )
  const [form, setForm] = useState(() => formFromLookup(book, acquired, others, seriesNames))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setPerson = (i, changes) =>
    setForm((f) => ({ ...f, people: f.people.map((p, n) => (n === i ? { ...p, ...changes } : p)) }))
  const linkedTo = others.find((c) => c.work?.id === form.workId)

  async function save(e) {
    e.preventDefault()
    const problem = addProblem(form)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      onSaved(
        await saveNewBook({
          form,
          book,
          isbn13: scan.isbn,
          libraryId: copies[0].library_id,
          knownAuthorIds: new Set(authors.map((a) => a.id)),
        }),
      )
    } catch (err) {
      setError(`Couldn't add the book: ${err.message} Tap Save to try again.`)
      setBusy(false)
    }
  }

  return (
    <form className="edit-book" onSubmit={save} noValidate>
      <div className="scan-preview">
        <span className="thumb large">{book.coverUrl && <img src={book.coverUrl} alt="" />}</span>
        <div>
          <p className="book-meta">
            {[book.publisher, book.year, book.pages && `${book.pages} pages`, book.binding].filter(Boolean).join(' · ')}
          </p>
          {book.firstPublished && <p className="book-meta">First published {book.firstPublished}</p>}
          <p className="book-meta">
            ISBN {scan.isbn} · from {book.sources.join(' and ')}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {others.length > 0 && (
        <div className="scan-editions">
          <p>
            <strong>You own another edition:</strong> {others[0].title}
            {others[0].byline && ` by ${others[0].byline}`}
          </p>
          <label className="edit-check">
            <input
              type="checkbox"
              checked={Boolean(form.workId)}
              onChange={(e) => set('workId')(e.target.checked ? others[0].work.id : '')}
            />
            Add as another edition of it (same authors and first published year)
          </label>
        </div>
      )}

      <TitleField label="Title" value={form.title} onChange={set('title')} />
      {form.originalTitle && <p className="diagnostic">Tidied from “{form.originalTitle}”</p>}

      {linkedTo ? (
        <p className="book-meta">Authors: {linkedTo.byline || 'none listed'}, from your other edition.</p>
      ) : (
        <>
          {form.people.map((person, i) => (
            <div key={i}>
              <div className="edit-pair">
                <Field label="Author last name" value={person.last} onChange={(last) => setPerson(i, { last })} />
                <Field label="First name" value={person.first} onChange={(first) => setPerson(i, { first })} />
              </div>
              <AuthorNote authors={authors} person={person} onUse={(name) => setPerson(i, name)} />
            </div>
          ))}
          <button
            type="button"
            className="link edit-add"
            onClick={() => set('people')([...form.people, { last: '', first: '' }])}
          >
            + Add another person
          </button>
        </>
      )}

      <LabelRows label="Series" rows={form.series} names={seriesNames} onChange={set('series')} />
      <LabelRows
        label="Publisher's series"
        rows={form.publisherSeries}
        names={publisherSeriesNames}
        onChange={set('publisherSeries')}
      />
      <Field label="Edition note" value={form.editionNote} onChange={set('editionNote')} />

      <h3>From the bookplate</h3>
      <datalist id="add-cities">{places.city.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="add-regions">{places.region.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="add-countries">{places.country.map((p) => <option key={p} value={p} />)}</datalist>
      <div className="edit-pair">
        <Field label="Year acquired" value={form.acquiredYear} onChange={set('acquiredYear')} numeric />
        <Field label="City" value={form.city} onChange={set('city')} list="add-cities" />
        <Field label="State / region" value={form.region} onChange={set('region')} list="add-regions" />
        <Field label="Country" value={form.country} onChange={set('country')} list="add-countries" />
      </div>

      <div className="review-actions">
        <button type="button" className="link" onClick={onSkip} disabled={busy}>
          Skip
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save and next'}
        </button>
      </div>
    </form>
  )
}

// Goes through the scanned books in the order they were scanned, one form at a
// time. `queue` is their ISBNs, fixed when the screen opened.
function AddCheck({ queue, scans, copies, acquired, onSkipped, onDone, addCopy }) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState({ added: 0, skipped: 0 })
  // Books added on this screen, so a book just added isn't taken for one owned before.
  const [addedHere, setAddedHere] = useState(() => new Set())
  // Something to say about a book just added, shown until Next.
  const [warning, setWarning] = useState('')
  const isbn = queue[index]
  const scan = scans.find((s) => s.isbn === isbn)
  const next = (kind) => {
    setResults((r) => ({ ...r, [kind]: r[kind] + 1 }))
    setWarning('')
    setIndex((i) => i + 1)
    window.scrollTo(0, 0)
  }

  // The book is saved; now show it in the catalog, then move on.
  async function saved({ id, warning: saveWarning }) {
    setAddedHere((s) => new Set(s).add(isbn))
    let problem = saveWarning
    try {
      await addCopy(id)
    } catch (err) {
      problem = [problem, `The book was added, but the app couldn't show it yet (${err.message}). Close and reopen the app to see it.`].filter(Boolean).join(' ')
    }
    if (problem) setWarning(problem)
    else next('added')
  }

  const header = (
    <div className="pinned-back">
      <button className="link" onClick={onDone}>
        ‹ Back to scanning
      </button>
      {isbn && (
        <span className="book-meta">
          {' '}
          · Book {index + 1} of {queue.length}
        </span>
      )}
    </div>
  )

  if (!isbn) {
    return (
      <div className="series-view">
        {header}
        <h2>All checked</h2>
        <p>
          Added {results.added} {results.added === 1 ? 'book' : 'books'}
          {results.skipped ? `, skipped ${results.skipped}` : ''}.
        </p>
        {results.added > 0 && (
          <p className="book-meta">
            New books are on Library › Review categories until the category vote comes to Scan to add.
          </p>
        )}
        <button className="primary" onClick={onDone}>
          Back to scanning
        </button>
      </div>
    )
  }

  const owned = copiesWithIsbn(copies, isbn)
  const { status, book } = scan?.lookup ?? {}
  let body
  if (warning) {
    body = <p className="scan-hint">{warning}</p>
  } else if (owned.length && !addedHere.has(isbn)) {
    body = <p className="placeholder">You own this one already.</p>
  } else if (status === 'looking') {
    body = <p className="placeholder">Looking it up…</p>
  } else if (status !== 'done' || !book.found) {
    body = <p className="placeholder">No record was found for ISBN {isbn}. Adding by hand comes in a later step.</p>
  }

  return (
    <div className="series-view">
      {header}
      {body ? (
        <>
          <h2>ISBN {isbn}</h2>
          {body}
          <button className="primary" onClick={() => next(warning ? 'added' : 'skipped')}>
            Next
          </button>
        </>
      ) : (
        <>
          <h2>Check and add</h2>
          <CheckBook
            key={isbn}
            scan={scan}
            copies={copies}
            acquired={acquired}
            onSaved={saved}
            onSkip={() => {
              onSkipped(isbn)
              next('skipped')
            }}
          />
        </>
      )}
    </div>
  )
}

export default AddCheck
