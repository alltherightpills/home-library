import { useEffect, useMemo, useState } from 'react'
import { placeTitle } from './acquired.js'
import { renameRememberedPlace } from './addBook.js'
import BookList from './BookList.jsx'
import { BackBar, Row } from './CategoryView.jsx'
import { Field } from './EditBook.jsx'
import { exactText, placesIn, renamePlacePlan } from './managePlaces.js'
import { loadPlaceRows, renamePlace, savePin, searchPlace, tidyPlaces } from './placeEdits.js'
import { placeKey } from './placeMap.js'

const bookCount = (n) => `${n.toLocaleString()} ${n === 1 ? 'book' : 'books'}`

// How a place stands on the map, from its saved row (if any).
function pinStatus(row) {
  if (!row) return 'Not looked up yet: the map does it when opened'
  if (row.latitude == null) return 'Not found on the map'
  return row.source === 'owner' ? 'On the map: a pin you chose' : 'On the map'
}

// The saved map rows by place, loaded fresh by each screen (a short list).
// `tidy` first clears rows no book uses (the Places list does this on opening).
function usePlaceRows(tidy) {
  const [state, setState] = useState({ rows: null, error: '' })
  useEffect(() => {
    let cancelled = false
    ;(async () => (tidy ? tidyPlaces() : null))()
      .then(loadPlaceRows)
      .then(
        (rows) => !cancelled && setState({ rows, error: '' }),
        (e) => !cancelled && setState({ rows: null, error: e.message }),
      )
    return () => {
      cancelled = true
    }
  }, [tidy])
  const byKey = useMemo(() => new Map((state.rows ?? []).map((r) => [placeKey(r), r])), [state.rows])
  return { ...state, byKey, setRow: (row) => setState((s) => ({ ...s, rows: [...(s.rows ?? []).filter((r) => r.id !== row.id), row] })) }
}

// Manage › Places: every place on a book, A to Z by its exact text, so near
// spellings sit together; tap one to rename it (or merge it into another).
export function PlacesList({ copies, onOpenPlace, onBack }) {
  const places = useMemo(() => placesIn(copies), [copies])
  const saved = usePlaceRows(true)
  return (
    <div className="series-view manage-places">
      <BackBar onBack={onBack} label="Manage" />
      <h2>Places</h2>
      <p className="book-meta">
        {places.length.toLocaleString()} places, exactly as typed on the books, so near spellings sit together. Tap one
        to rename it on every book; renaming it to another place's exact name merges the two.
      </p>
      {saved.error && <p className="error">{saved.error}</p>}
      <ul className="category-rows">
        {places.map((p) => (
          <Row
            key={p.key}
            name={exactText(p.place)}
            detail={saved.rows ? pinStatus(saved.byKey.get(p.key)) : ''}
            count={bookCount(p.books.length)}
            onOpen={() => onOpenPlace('placeEdit', p.key)}
          />
        ))}
      </ul>
    </div>
  )
}

// One place: Rename (on every book from it), where the map put it with Search
// again, and its books.
export function PlacePage({ place: nav, copies, updateCopies, onReplacePlace, onOpenBook, onBack }) {
  const places = useMemo(() => placesIn(copies), [copies])
  const entry = places.find((p) => p.key === nav.id)
  const saved = usePlaceRows(false)
  const [renaming, setRenaming] = useState(false)
  const books = useMemo(() => (entry ? [...entry.books].sort((a, b) => a.titleSort.localeCompare(b.titleSort)) : []), [entry])

  if (!entry) {
    return (
      <div className="series-view manage-places">
        <BackBar onBack={onBack} label="Places" />
        <p className="book-meta">No book is from this place now.</p>
      </div>
    )
  }
  const { place } = entry
  const row = saved.byKey.get(entry.key)
  return (
    <div className="series-view manage-places">
      <BackBar onBack={onBack} label="Places" />
      <h2>{exactText(place)}</h2>
      <p className="book-meta">
        Shown as {placeTitle(place)} · {bookCount(books.length)}
      </p>
      {renaming ? (
        <RenamePlaceForm
          entry={entry}
          places={places}
          onCancel={() => setRenaming(false)}
          onSaved={(to) => {
            updateCopies(
              entry.books.map((b) => b.id),
              { acquired_city: to.city, acquired_region: to.region, acquired_country: to.country },
            )
            renameRememberedPlace(place, to)
            // The renamed place's own page, in this step's spot in the history.
            onReplacePlace({ kind: 'placeEdit', id: placeKey(to) })
          }}
        />
      ) : (
        <p>
          <button className="link strong" onClick={() => setRenaming(true)}>
            Rename on every book
          </button>
        </p>
      )}

      <h3 className="section-label">On the map</h3>
      {saved.error ? (
        <p className="error">{saved.error}</p>
      ) : saved.rows ? (
        <Pin place={place} row={row} libraryId={copies[0]?.library_id} onSaved={saved.setRow} />
      ) : (
        <p className="book-meta">Loading…</p>
      )}

      <h3 className="section-label">Books</h3>
      <BookList books={books} onOpenBook={onOpenBook} letters="title" />
    </div>
  )
}

function RenamePlaceForm({ entry, places, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    city: entry.place.city ?? '',
    region: entry.place.region ?? '',
    country: entry.place.country ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const plan = renamePlacePlan(places, entry.place, form)
  const canSave = !busy && !plan.problem && !plan.unchanged
  const set = (name) => (value) => setForm({ ...form, [name]: value })
  const n = entry.books.length

  async function save(e) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError('')
    try {
      await renamePlace(entry.place, plan.to)
      onSaved(plan.to)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="edit-book rename-person" onSubmit={save} noValidate>
      <Field label="City" value={form.city} onChange={set('city')} />
      <div className="edit-pair">
        <Field label="State or region" value={form.region} onChange={set('region')} />
        <Field label="Country" value={form.country} onChange={set('country')} />
      </div>
      {plan.problem && <p className="error">{plan.problem}</p>}
      {plan.joins ? (
        <p>
          <strong>{exactText(plan.joins.place)}</strong> is already a place ({bookCount(plan.joins.books.length)}). Saving
          merges the two: all {(n + plan.joins.books.length).toLocaleString()} books will be from it.
        </p>
      ) : (
        !plan.problem &&
        !plan.unchanged && (
          <p className="book-meta">
            {n === 1 ? 'Its 1 book' : `All ${n.toLocaleString()} books`} will be from{' '}
            <strong>{exactText(plan.to)}</strong>. The map looks the new name up the next time it opens.
          </p>
        )
      )}
      {error && <p className="error">{error}</p>}
      <div className="controls">
        <button type="submit" className="primary" disabled={!canSave}>
          {busy ? 'Saving…' : plan.joins ? 'Merge' : 'Rename'}
        </button>
        <button type="button" className="link" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// Where the map put this place, and Search again: different wording for the
// place search (only for finding it; the books keep their text), then a tap
// on the right match saves it as this place's pin.
function Pin({ place, row, libraryId, onSaved }) {
  const [searching, setSearching] = useState(false)
  const [wording, setWording] = useState(() => ({ city: place.city ?? '', region: place.region ?? '', country: place.country ?? '' }))
  const [hits, setHits] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const set = (name) => (value) => setWording({ ...wording, [name]: value })

  async function search(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const tidy = (t) => t.trim() || null
      setHits(await searchPlace({ city: tidy(wording.city), region: tidy(wording.region), country: tidy(wording.country) }))
    } catch (err) {
      setError(`Couldn't search just now: ${err.message}`)
    }
    setBusy(false)
  }

  async function choose(hit) {
    setBusy(true)
    setError('')
    try {
      onSaved(await savePin(place, hit, libraryId, row))
      setSearching(false)
      setHits(null)
      setNotice('Pin saved. The map shows it there from now on.')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <p>{pinStatus(row)}</p>
      {row?.found_as && <p className="book-meta">Matched: {row.found_as}</p>}
      {notice && <p className="book-meta">{notice}</p>}
      {!searching ? (
        <p>
          <button className="link strong" onClick={() => setSearching(true)}>
            {row?.latitude == null ? 'Search for it' : 'Wrong spot? Search again'}
          </button>
        </p>
      ) : (
        <form className="edit-book rename-person" onSubmit={search} noValidate>
          <p className="book-meta">
            Try other wording, such as a nearby town or the full state name. This only finds the spot on the map; the
            books keep their place as it is.
          </p>
          <Field label="City" value={wording.city} onChange={set('city')} />
          <div className="edit-pair">
            <Field label="State or region" value={wording.region} onChange={set('region')} />
            <Field label="Country" value={wording.country} onChange={set('country')} />
          </div>
          <div className="controls">
            <button type="submit" className="primary" disabled={busy}>
              {busy && !hits ? 'Searching…' : 'Search'}
            </button>
            <button type="button" className="link" onClick={() => (setSearching(false), setHits(null))} disabled={busy}>
              Cancel
            </button>
          </div>
          {hits?.length === 0 && <p className="book-meta">Nothing found. Try other wording.</p>}
          {hits?.length > 0 && (
            <>
              <p className="book-meta">Tap the right one:</p>
              <ul className="category-rows">
                {hits.map((hit) => (
                  <li key={hit.place_id ?? `${hit.lat},${hit.lon}`}>
                    <button type="button" onClick={() => choose(hit)} disabled={busy}>
                      <span className="category-name">{hit.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </>
  )
}
