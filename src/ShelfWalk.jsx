import { useMemo, useState } from 'react'
import AddByHand from './AddByHand.jsx'
import { CheckBook } from './AddCheck.jsx'
import { Field } from './EditBook.jsx'
import IsbnReader from './IsbnReader.jsx'
import { changeRows, editionChanges } from './editionFix.js'
import { copiesWithIsbn } from './isbn.js'
import { dateText, readingsOf } from './readings.js'
import { lookUpNewBook, otherEditions } from './scanLookup.js'
import {
  acquiredFrom,
  checkForm,
  finishNewBook,
  saveEditionFix,
  saveWalk,
  startForm,
  titleMatches,
  walkSuggestions,
} from './shelfWalk.js'
import { coverUrl } from './useCatalog.js'

const SHORTCUTS = 5 // one-tap buttons under the year and place boxes
// The year wheel runs from this year (as of opening the app) back to 1995.
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: THIS_YEAR - 1995 + 1 }, (_, i) => String(THIS_YEAR - i))

// The shelf walk: scan a book (or find it by title), fill in its card, Save
// and scan next. `copies` carry `read` (see Library.jsx). A book not in the
// catalog gets the card first, then the Check and add form (or Add by hand).
function ShelfWalk({ copies, categories, readings, updateCopy, addCopy, onOpenPlace, onBack }) {
  // The card being filled in (a copy id), or null while scanning.
  const [cardId, setCardId] = useState(null)
  // What the last scan found, while scanning: { isbn, owned: [copies] }, and
  // for an ISBN not owned, its `lookup` ({ status, book }) to find the book
  // under another edition's ISBN.
  const [scan, setScan] = useState(null)
  // Turning that copy (an id) into the scanned edition, or null.
  const [fixingId, setFixingId] = useState(null)
  // Find by title: the words typed, or null while the camera is showing. Kept
  // while a found book's card is open, so Skip returns to the results.
  const [finding, setFinding] = useState(null)
  const matches = useMemo(() => (finding ? titleMatches(copies, finding) : []), [copies, finding])
  // The last book saved, to change it if it was a slip.
  const [lastId, setLastId] = useState(null)
  // Adding a book not in the catalog: { isbn (null for none), lookup, answers
  // (the card's form, once Continue is tapped) }, or null.
  const [adding, setAdding] = useState(null)
  // Something to say about the last book added, shown until the next scan.
  const [notice, setNotice] = useState('')
  const suggestions = useMemo(() => walkSuggestions(copies), [copies])

  const walked = copies.filter((c) => c.shelf_walked_on).length
  const card = copies.find((c) => c.id === cardId)
  const last = copies.find((c) => c.id === lastId)

  function handleIsbn(isbn) {
    setNotice('')
    const owned = copiesWithIsbn(copies, isbn)
    if (owned.length === 1) {
      setScan(null)
      setCardId(owned[0].id)
    } else if (owned.length) {
      setScan({ isbn, owned })
    } else {
      // Look it up now: you may own it under another edition's ISBN.
      setScan({ isbn, owned, lookup: { status: 'looking' } })
      const setLookup = (lookup) => setScan((s) => (s?.isbn === isbn ? { ...s, lookup } : s))
      lookUpNewBook(isbn, copies[0].library_id)
        .then((book) => setLookup({ status: 'done', book }))
        .catch((err) => setLookup({ status: 'error', message: err.message }))
    }
  }

  // Looks the book up while its card is filled in (unless the scan already did).
  function startAdding(isbn, known = null) {
    setNotice('')
    setAdding({ isbn, lookup: known ?? (isbn ? { status: 'looking' } : null), answers: null })
    if (!isbn || known) return
    const setLookup = (lookup) => setAdding((a) => (a?.isbn === isbn ? { ...a, lookup } : a))
    lookUpNewBook(isbn, copies[0].library_id)
      .then((book) => setLookup({ status: 'done', book }))
      .catch((err) => setLookup({ status: 'error', message: err.message }))
  }

  // The new book is saved, with the card's year and place: show it, mark it
  // walked (and read), and go back to the camera.
  async function added({ id, warning }) {
    const { answers } = adding
    const problems = [warning]
    let copy = { id, library_id: copies[0].library_id }
    try {
      copy = await addCopy(id)
    } catch (err) {
      problems.push(`The app couldn't show it yet (${err.message}). Close and reopen the app to see it.`)
    }
    try {
      updateCopy(id, await finishNewBook(copy, answers, readings))
    } catch (err) {
      problems.push(`It's in your library, but saving the walk failed (${err.message}). Use Change below to try again.`)
    }
    setAdding(null)
    setScan(null)
    setFinding(null)
    setLastId(id)
    setNotice(problems.filter(Boolean).join(' '))
    window.scrollTo(0, 0)
  }

  // After the card: the Check and add form, or Add by hand with no record.
  if (adding?.answers) {
    const acquired = acquiredFrom(adding.answers)
    const cancel = () => setAdding(null)
    const { lookup } = adding
    if (lookup?.status === 'done' && lookup.book.found) {
      return (
        <div className="series-view shelf-walk">
          <div className="pinned-back">
            <button className="link" onClick={cancel}>
              ‹ Back to the walk
            </button>
          </div>
          <h2>Check and add</h2>
          <CheckBook
            book={lookup.book}
            isbn={adding.isbn}
            copies={copies}
            categories={categories}
            acquired={acquired}
            onSaved={added}
            onSkip={cancel}
            skipLabel="Don't add"
          />
        </div>
      )
    }
    if (lookup?.status === 'looking') {
      return (
        <div className="series-view shelf-walk">
          <div className="pinned-back">
            <button className="link" onClick={cancel}>
              ‹ Back to the walk
            </button>
          </div>
          <p className="placeholder">Looking it up…</p>
        </div>
      )
    }
    return (
      <div className="shelf-walk">
        {lookup && (
          <p className="scan-hint">
            {lookup.status === 'error'
              ? `Couldn't look up ISBN ${adding.isbn}: check your connection (${lookup.message}). You can still add it by hand.`
              : `No record was found for ISBN ${adding.isbn}. Search for it by title instead.`}
          </p>
        )}
        <AddByHand
          isbn={adding.isbn}
          copies={copies}
          categories={categories}
          acquired={acquired}
          addCopy={addCopy}
          onDone={cancel}
          onAdded={added}
          backLabel="Back to the walk"
        />
      </div>
    )
  }

  // The scanned edition before saving it over a copy you own.
  const fixing = copies.find((c) => c.id === fixingId)
  if (fixing && scan?.lookup?.status === 'done') {
    return (
      <EditionFix
        copy={fixing}
        book={scan.lookup.book}
        isbn={scan.isbn}
        onSaved={(changes) => {
          updateCopy(fixing.id, changes)
          setFixingId(null)
          setScan(null)
          setCardId(fixing.id) // on to its card, as if it had scanned
        }}
        onCancel={() => setFixingId(null)}
      />
    )
  }

  // For an ISBN not owned: copies that may be the same book under another ISBN.
  const lookedUp = scan?.lookup?.status === 'done' ? scan.lookup : null
  const sameBook = lookedUp ? otherEditions(copies, lookedUp.book) : []

  return (
    <div className="series-view shelf-walk">
      <div className="pinned-back">
        <button className="link" onClick={onBack}>
          ‹ My Library
        </button>
      </div>
      <h2>Shelf walk</h2>
      <p className="book-meta">
        {walked.toLocaleString()} of {copies.length.toLocaleString()} books walked
        {walked < copies.length && (
          <>
            {' · '}
            <button className="link" onClick={() => onOpenPlace('all', 'unwalked')}>
              Not walked yet ›
            </button>
          </>
        )}
      </p>

      {adding ? (
        <WalkCard
          key={`new:${adding.isbn}`}
          copy={newBookCard(adding)}
          readings={readings}
          suggestions={suggestions}
          submit={async (form) => form}
          submitLabel="Continue"
          onSaved={(answers) => setAdding((a) => ({ ...a, answers }))}
          onCancel={() => setAdding(null)}
        />
      ) : card ? (
        <WalkCard
          key={card.id}
          copy={card}
          readings={readings}
          suggestions={suggestions}
          onSaved={(changes, { stay = false } = {}) => {
            updateCopy(card.id, changes)
            if (stay) return
            setLastId(card.id)
            setCardId(null)
            setFinding(null) // back to the camera for the next book
          }}
          onCancel={() => setCardId(null)}
        />
      ) : (
        <>
          {notice && <p className="scan-hint">{notice}</p>}
          {last && (
            <p className="book-meta walk-last">
              Saved <strong>{last.title}</strong> ·{' '}
              <button className="link" onClick={() => setCardId(last.id)}>
                Change
              </button>
            </p>
          )}
          {finding !== null ? (
            <div className="walk-find">
              <input
                className="search"
                value={finding}
                onChange={(e) => setFinding(e.target.value)}
                placeholder="Title"
                aria-label="Title"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <button className="link" onClick={() => setFinding(null)}>
                Back to scanning
              </button>
              {finding.trim() && matches.length === 0 && <p className="placeholder">No title in your library matches.</p>}
              <CopyPicks copies={matches} onPick={setCardId} />
              {finding.trim() && (
                <p className="by-hand-link">
                  <button className="link" onClick={() => startAdding(null)}>
                    Not in your library? Add it
                  </button>
                </p>
              )}
            </div>
          ) : (
            <IsbnReader onIsbn={handleIsbn} startNow>
              <p className="by-hand-link">
                <button
                  className="link"
                  onClick={() => {
                    setScan(null)
                    setFinding('')
                  }}
                >
                  Can't scan it? Find by title
                </button>
              </p>
            </IsbnReader>
          )}
          {finding === null && scan && scan.owned.length === 0 && sameBook.length > 0 && (
            <>
              <p className="review-note">
                {scan.isbn} isn't in your library, but you may own this book under another ISBN. Is it one of these?
              </p>
              <CopyPicks copies={sameBook} onPick={setFixingId} />
              <p className="by-hand-link">
                <button className="link" onClick={() => startAdding(scan.isbn, lookedUp)}>
                  None of these? Add it
                </button>
              </p>
            </>
          )}
          {finding === null && scan && scan.owned.length === 0 && sameBook.length === 0 && (
            <p className="review-note">
              {scan.isbn} isn't in your library
              {scan.lookup?.status === 'looking' ? ' (checking for another edition you own…)' : ''}.{' '}
              <button className="link strong" onClick={() => startAdding(scan.isbn, lookedUp)}>
                Add it
              </button>
            </p>
          )}
          {finding === null && scan && scan.owned.length > 1 && (
            <>
              <p>You own {scan.owned.length} copies with this ISBN. Which one is this?</p>
              <CopyPicks copies={scan.owned} onPick={setCardId} />
            </>
          )}
        </>
      )}
    </div>
  )
}

// What the card shows for a book not in the catalog, as it's looked up.
function newBookCard({ isbn, lookup }) {
  const book = lookup?.status === 'done' && lookup.book.found ? lookup.book : null
  let title = 'New book (no ISBN)'
  if (book) title = book.title
  else if (lookup?.status === 'looking') title = 'Looking it up…'
  else if (isbn) title = `ISBN ${isbn}`
  return {
    title,
    listLine: [book?.authors.join(', '), 'Not in your library yet'].filter(Boolean).join(' · '),
    cover_url: book?.coverUrl ?? null,
  }
}

// Before turning a copy into the edition just scanned: both covers, what changes,
// and what doesn't. Yes saves it; the walk then opens its card.
function EditionFix({ copy, book, isbn, onSaved, onCancel }) {
  const changes = useMemo(() => editionChanges(copy, book, isbn), [copy, book, isbn])
  const rows = changeRows(copy, changes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const coverChanges = coverUrl(copy, 'M') !== coverUrl(changes, 'M')

  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await saveEditionFix(copy, changes))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="series-view shelf-walk">
      <div className="pinned-back">
        <button className="link" onClick={onCancel} disabled={busy}>
          ‹ Back to the walk
        </button>
      </div>
      <h2>Is this your copy?</h2>
      <p>
        <strong>{copy.title}</strong> is in your library as another edition. Update it to the edition you scanned?
      </p>
      {coverChanges && (
        <div className="edition-covers">
          {[
            ['Now', copy],
            ['Scanned', changes],
          ].map(([label, c]) => (
            <figure key={label}>
              <span className="thumb large">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" />}</span>
              <figcaption className="book-meta">{label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <table className="edition-changes">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.from}</td>
              <td aria-hidden="true">→</td>
              <td>{r.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="book-meta">
        Title, authors, categories, subjects, publisher's series, edition note, reading and acquired stay as they are.
        Change them on the book's page if they're wrong too.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Yes, update this copy'}
        </button>
        <button className="secondary" onClick={onCancel} disabled={busy}>
          No, go back
        </button>
      </div>
    </div>
  )
}

// Books to pick from (copies with one ISBN, or titles found), each saying
// whether it's been walked.
function CopyPicks({ copies, onPick }) {
  if (!copies.length) return null
  return (
    <ul className="book-list">
      {copies.map((c) => (
        <li key={c.id}>
          <button onClick={() => onPick(c.id)}>
            <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" />}</span>
            <span className="book-title">{c.title}</span>
            <span className="book-meta">
              {[c.listLine, c.shelf_walked_on && `walked ${dateText(c.shelf_walked_on)}`].filter(Boolean).join(' · ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// One book's card: year, place, country, and Read? yes or no. `submit` saves
// it (a new book's card just hands its answers on, with Continue).
function WalkCard({
  copy,
  readings,
  suggestions,
  onSaved,
  onCancel,
  submit = (form) => saveWalk(copy, form, readings),
  submitLabel = 'Save and scan next',
}) {
  const [form, setForm] = useState(() => startForm(copy))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const reading = readingsOf(readings.list, copy.id).some((r) => r.status === 'reading')
  // Asked only when the answer could change something.
  const askRead = !copy.read && !reading

  async function save(e) {
    e.preventDefault()
    const problem = checkForm(form, askRead)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      onSaved(await submit(form))
    } catch (err) {
      // The year and place may have gone in even though the read didn't:
      // show them, and stay on the card so Save can try the read again.
      if (err.saved) onSaved(err.saved, { stay: true })
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="edit-book walk-card" onSubmit={save}>
      <div className="scan-preview">
        <span className="thumb large">{coverUrl(copy, 'M') && <img src={coverUrl(copy, 'M')} alt="" />}</span>
        <div>
          <p className="book-title">{copy.title}</p>
          <p className="book-meta">{copy.listLine}</p>
          {copy.shelf_walked_on && <p className="book-meta">Walked {dateText(copy.shelf_walked_on)}</p>}
        </div>
      </div>

      <datalist id="walk-places">{suggestions.places.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="walk-countries">{suggestions.countries.map((c) => <option key={c} value={c} />)}</datalist>

      <YearWheel value={form.year} onChange={set('year')} />
      <Shortcuts values={suggestions.years} chosen={form.year} onPick={set('year')} />

      <Field label="Place (city, state)" value={form.place} onChange={set('place')} list="walk-places" />
      <Shortcuts values={suggestions.places} chosen={form.place} onPick={set('place')} />

      <Field label="Country" value={form.country} onChange={set('country')} list="walk-countries" />

      <div className="walk-read">
        <span>Read?</span>
        {askRead ? (
          ['yes', 'no'].map((answer) => (
            <button
              key={answer}
              type="button"
              className={form.read === answer ? 'chip active' : 'chip'}
              onClick={() => set('read')(answer)}
            >
              {answer === 'yes' ? 'Yes' : 'No'}
            </button>
          ))
        ) : (
          <span className="book-meta">{copy.read ? "✓ You've read this" : 'Currently reading'}</span>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="walk-actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button className="link" type="button" disabled={busy} onClick={onCancel}>
          Skip
        </button>
      </div>
      <p className="book-meta">Leave year and place blank for a book with no bookplate.</p>
    </form>
  )
}

// Year acquired as a list, which the iPhone shows as a scroll wheel: blank
// (no bookplate), then YEARS. A year already saved outside them is kept as a choice.
function YearWheel({ value, onChange }) {
  const years = value && !YEARS.includes(value) ? [...YEARS, value] : YEARS
  return (
    <label>
      Year acquired
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  )
}

// The most used values, as buttons that fill the box.
function Shortcuts({ values, chosen, onPick }) {
  if (!values.length) return null
  return (
    <div className="controls walk-shortcuts">
      {values.slice(0, SHORTCUTS).map((v) => (
        <button key={v} type="button" className={v === chosen ? 'chip active' : 'chip'} onClick={() => onPick(v)}>
          {v}
        </button>
      ))}
    </div>
  )
}

export default ShelfWalk
