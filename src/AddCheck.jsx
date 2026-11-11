import { useMemo, useState } from 'react'
import { CategoryFields, Field, LabelRows, TitleField } from './EditBook.jsx'
import { addProblem, authorMatches, authorsIn, formFromLookup, saveNewBook } from './addBook.js'
import { nameParts } from './bookEdits.js'
import { flagText, planShelfEdit, shelfChoices, shelfText } from './categories/review.js'
import { copiesWithIsbn } from './isbn.js'
import { listText, otherEditions } from './scanLookup.js'
import { labelNames } from './series.js'
import { wishesForBook } from './wishlist.js'

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

// What the category vote picked and how sure it is, above the Categories fields.
function VoteNote({ vote, categories, mainId, onUseGuess }) {
  if (vote.problem) {
    return <p className="error">The category vote couldn't run ({vote.problem}). Pick a main category, or the book goes to Review categories.</p>
  }
  const voted = { shelves: vote.shelves }
  const pick = shelfText(voted, categories).main
  const unsure = vote.review?.flags ?? []
  const suggested = vote.review?.suggestions ?? []
  const tentative = vote.result.subs.filter((s) => s.tentative)
  return (
    <div className="review-note">
      <p>
        The vote picked <strong>{pick || 'no main category'}</strong>
        {vote.result.mainBecause && <span className="book-meta"> ({vote.result.mainBecause})</span>}
        {' '}· {vote.audience}
      </p>
      {unsure.length > 0 && <p>Not sure: {unsure.map(flagText).join('; ')}</p>}
      {vote.guess && !mainId && (
        <p>
          <button type="button" className="link strong" onClick={() => onUseGuess(vote.guess.id)}>
            Use {vote.guess.main}
          </button>{' '}
          <span className="book-meta">({vote.guess.because})</span>
        </p>
      )}
      {tentative.map((s) => (
        <p key={s.sub} className="diagnostic review-reasons">
          {s.sub} is tentative: {s.votes.map((v) => v.because).join('; ')}
        </p>
      ))}
      {suggested.length > 0 && (
        <p className="book-meta">
          Suggested: {suggested.map((s) => `${s.sub} (${s.score} ${s.score === 1 ? 'point' : 'points'})`).join(', ')}
        </p>
      )}
    </div>
  )
}

// The check form for one book, scanned or (`manual`) added by hand, which also
// shows the edition's details to fill in. onSaved gets { id, warning } once the
// book is in the database.
export function CheckBook({ book, isbn, manual, copies, categories, acquired, wishlist, onSaved, onSkip, skipLabel = 'Skip' }) {
  // Copies you own with this very ISBN (Add another copy) come first, so the
  // new copy joins their work and starts with their categories and audience.
  const twins = useMemo(() => (isbn ? copiesWithIsbn(copies, isbn) : []), [copies, isbn])
  const others = useMemo(() => {
    const editions = otherEditions(copies, book)
    return [...twins, ...editions.filter((c) => !twins.includes(c))]
  }, [copies, book, twins])
  // Wishes for this book in any edition, fixed when the form opens; with the
  // tick on (the default), saving takes them off the wishlist.
  // (The Shelf walk's adds pass no wishlist.)
  const [wishes] = useState(() => wishesForBook(wishlist?.list, book, isbn))
  const [takeOff, setTakeOff] = useState(true)
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
  // The vote runs once, on the book as it was looked up.
  const [{ form: startForm, vote }] = useState(() => {
    const start = formFromLookup(book, acquired, others, seriesNames, categories)
    const twin = twins[0]
    if (!twin) return start
    // The vote is still saved, as for any new book; the starting choices
    // follow the copy you own, and saving them makes them the owner's.
    return { ...start, form: { ...start.form, shelves: shelfChoices(twin, categories), audience: twin.audience ?? start.form.audience } }
  })
  const [form, setForm] = useState(startForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setPerson = (i, changes) =>
    setForm((f) => ({ ...f, people: f.people.map((p, n) => (n === i ? { ...p, ...changes } : p)) }))
  const linkedTo = others.find((c) => c.work?.id === form.workId)
  // Changing the main category or its subcategories makes them the owner's choice anyway.
  const changedShelves = planShelfEdit({ shelves: vote.shelves }, categories, form.shelves).decided

  async function save(e) {
    e.preventDefault()
    const problem = addProblem(form)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    let result
    try {
      result = await saveNewBook({
        form,
        book,
        vote,
        categories,
        isbn13: isbn,
        libraryId: copies[0].library_id,
        knownAuthorIds: new Set(authors.map((a) => a.id)),
      })
    } catch (err) {
      setError(`Couldn't add the book: ${err.message} Tap Save to try again.`)
      setBusy(false)
      return
    }
    // The book is in; a wish that won't come off is only a warning.
    if (takeOff) {
      for (const wish of wishes) {
        try {
          await wishlist.remove(wish)
        } catch (err) {
          const problem = `The book was added, but “${wish.title}” couldn't be taken off the wishlist (${err.message}). Remove it on the Wishlist screen.`
          result = { ...result, warning: [result.warning, problem].filter(Boolean).join(' ') }
        }
      }
    }
    onSaved(result)
  }

  return (
    <form className="edit-book" onSubmit={save} noValidate>
      <div className="scan-preview">
        <span className="thumb large">{book.coverUrl && <img src={book.coverUrl} alt="" />}</span>
        <div>
          {!manual && (
            <p className="book-meta">
              {[book.publisher, book.year, book.pages && `${book.pages} pages`, book.binding].filter(Boolean).join(' · ')}
            </p>
          )}
          {!manual && book.firstPublished && <p className="book-meta">First published {book.firstPublished}</p>}
          <p className="book-meta">
            {isbn ? `ISBN ${isbn}` : 'No ISBN'}
            {book.sources.length ? ` · from ${listText(book.sources)}` : ' · typed in'}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {wishes.length > 0 && (
        <div className="scan-editions">
          <p>
            <strong>★ On your wishlist:</strong> {wishes.map((w) => w.title).join('; ')}
            {wishes.length === 1 && wishes[0].isbn13 && wishes[0].isbn13 !== isbn && ' (another edition)'}
          </p>
          <label className="edit-check">
            <input type="checkbox" checked={takeOff} onChange={(e) => setTakeOff(e.target.checked)} />
            Take it off the wishlist
          </label>
        </div>
      )}

      {others.length > 0 && (
        <div className="scan-editions">
          <p>
            <strong>{twins.length ? 'You own this edition already:' : 'You own another edition:'}</strong> {others[0].title}
            {others[0].byline && ` by ${others[0].byline}`}
          </p>
          <label className="edit-check">
            <input
              type="checkbox"
              checked={Boolean(form.workId)}
              onChange={(e) => set('workId')(e.target.checked ? others[0].work.id : '')}
            />
            {twins.length
              ? 'Add as another copy of it (same authors and first published year)'
              : 'Add as another edition of it (same authors and first published year)'}
          </label>
          {twins.length > 0 && <p className="book-meta">Categories and audience start as your copy has them.</p>}
        </div>
      )}

      <TitleField label="Title" value={form.title} onChange={set('title')} />
      {form.originalTitle && <p className="diagnostic">Tidied from “{form.originalTitle}”</p>}

      {linkedTo ? (
        <p className="book-meta">Authors: {linkedTo.byline || 'none listed'}, from your {twins.includes(linkedTo) ? 'other copy' : 'other edition'}.</p>
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

      {manual && (
        <>
          <Field label="Publisher" value={form.publisher} onChange={set('publisher')} />
          <div className="edit-pair">
            <Field label="Edition year" value={form.editionYear} onChange={set('editionYear')} numeric />
            <Field label="Pages" value={form.pages} onChange={set('pages')} numeric />
            <label>
              Binding
              <select value={form.binding} onChange={(e) => set('binding')(e.target.value)}>
                <option value="">Not set</option>
                <option>Paperback</option>
                <option>Hardcover</option>
              </select>
            </label>
            {!linkedTo && (
              <Field label="First published" value={form.firstPublished} onChange={set('firstPublished')} numeric />
            )}
          </div>
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

      <h3>Categories</h3>
      <VoteNote
        vote={vote}
        categories={categories}
        mainId={form.shelves.mainId}
        onUseGuess={(mainId) => set('shelves')({ ...form.shelves, mainId })}
      />
      <CategoryFields shelves={form.shelves} categories={categories} onChange={set('shelves')} />
      <label>
        Audience
        <select value={form.audience} onChange={(e) => set('audience')(e.target.value)}>
          <option>Adult</option>
          <option>Teen</option>
          <option>Kids</option>
        </select>
      </label>
      {vote.review && form.shelves.mainId && (
        changedShelves ? (
          <p className="book-meta">Your changes make these categories your choice, so the book stays off Review categories.</p>
        ) : (
          <label className="edit-check">
            <input type="checkbox" checked={form.looksRight} onChange={(e) => set('looksRight')(e.target.checked)} />
            Looks right: keep it off Review categories
          </label>
        )
      )}

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
      <label>
        Location
        <select value={form.location} onChange={(e) => set('location')(e.target.value)}>
          <option>Home</option>
          <option>Office</option>
        </select>
      </label>

      <div className="review-actions">
        <button type="button" className="link" onClick={onSkip} disabled={busy}>
          {skipLabel}
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
// A scan marked `extraCopy` (Add another copy on Scan) is a book you own, added again.
function AddCheck({ queue, scans, copies, categories, acquired, wishlist, onSkipped, onAddByHand, onDone, addCopy }) {
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
            Books the vote wasn't sure about are on Library › Review categories.
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
  } else if (owned.length && !addedHere.has(isbn) && !scan?.extraCopy) {
    body = <p className="placeholder">You own this one already.</p>
  } else if (status === 'looking') {
    body = <p className="placeholder">Looking it up…</p>
  } else if (scan?.extraCopy && status !== 'done') {
    body = <p className="placeholder">Couldn't look it up: check your signal, then go back and tap Add another copy again.</p>
  } else if (scan?.extraCopy && !book.found) {
    body = (
      <>
        <p className="placeholder">No record was found online for ISBN {isbn}.</p>
        <button className="primary" onClick={() => onAddByHand(isbn)}>
          Add by hand
        </button>
      </>
    )
  } else if (status !== 'done' || !book.found) {
    body = <p className="placeholder">No record was found for ISBN {isbn}. Use its Add by hand link on the Scan tab.</p>
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
            book={scan.lookup.book}
            isbn={isbn}
            copies={copies}
            categories={categories}
            acquired={acquired}
            wishlist={wishlist}
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
