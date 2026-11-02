import { useMemo, useState } from 'react'
import { Field } from './EditBook.jsx'
import IsbnReader from './IsbnReader.jsx'
import { copiesWithIsbn } from './isbn.js'
import { dateText, readingsOf } from './readings.js'
import { checkForm, saveWalk, startForm, walkSuggestions } from './shelfWalk.js'
import { coverUrl } from './useCatalog.js'

const SHORTCUTS = 5 // one-tap buttons under the year and place boxes
// The year wheel runs from this year (as of opening the app) back to 1995.
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: THIS_YEAR - 1995 + 1 }, (_, i) => String(THIS_YEAR - i))

// The shelf walk: scan a book, fill in its card, Save and scan next.
// `copies` carry `read` (see Library.jsx).
function ShelfWalk({ copies, readings, updateCopy, onBack }) {
  // The card being filled in (a copy id), or null while scanning.
  const [cardId, setCardId] = useState(null)
  // What the last scan found, while scanning: { isbn, owned: [copies] }.
  const [scan, setScan] = useState(null)
  // The last book saved, to change it if it was a slip.
  const [lastId, setLastId] = useState(null)
  const suggestions = useMemo(() => walkSuggestions(copies), [copies])

  const walked = copies.filter((c) => c.shelf_walked_on).length
  const card = copies.find((c) => c.id === cardId)
  const last = copies.find((c) => c.id === lastId)

  function handleIsbn(isbn) {
    const owned = copiesWithIsbn(copies, isbn)
    if (owned.length === 1) {
      setScan(null)
      setCardId(owned[0].id)
    } else {
      setScan({ isbn, owned })
    }
  }

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
      </p>

      {card ? (
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
          }}
          onCancel={() => setCardId(null)}
        />
      ) : (
        <>
          {last && (
            <p className="book-meta walk-last">
              Saved <strong>{last.title}</strong> ·{' '}
              <button className="link" onClick={() => setCardId(last.id)}>
                Change
              </button>
            </p>
          )}
          <IsbnReader onIsbn={handleIsbn} startNow />
          {scan && scan.owned.length === 0 && (
            <p className="review-note">
              {scan.isbn} isn't in your library. Adding it from the walk comes next; for now, use the Scan tab.
            </p>
          )}
          {scan && scan.owned.length > 1 && (
            <>
              <p>You own {scan.owned.length} copies with this ISBN. Which one is this?</p>
              <ul className="book-list">
                {scan.owned.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setCardId(c.id)}>
                      <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" />}</span>
                      <span className="book-title">{c.title}</span>
                      <span className="book-meta">
                        {[c.listLine, c.shelf_walked_on && `walked ${dateText(c.shelf_walked_on)}`].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

// One book's card: year, place, country, and Read? yes or no.
function WalkCard({ copy, readings, suggestions, onSaved, onCancel }) {
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
      onSaved(await saveWalk(copy, form, readings))
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
          {busy ? 'Saving…' : 'Save and scan next'}
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
