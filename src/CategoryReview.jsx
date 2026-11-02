import { useMemo, useState } from 'react'
import BookList from './BookList.jsx'
import { saveShelfDecision } from './bookEdits.js'
import { REVIEW_FILTERS, flagText, inFilter, shelfParts, shelfText } from './categories/review.js'

const nameOf = (categories, id) => categories.find((c) => c.id === id)?.name

// What a row in the list says is on the book now, and why it's here.
function shelfLine(copy, categories) {
  const shelves = shelfText(copy, categories).main || 'No main category'
  // Those two flags would only repeat what the shelves already say.
  const notes = copy.category_review.flags.filter((f) => f !== 'no main category' && f !== 'tentative subcategory')
  return [shelves, ...notes.map(flagText)].join(' · ')
}

// One book: choose its main category and subcategories.
function ReviewBook({ copy, categories, onOpenBook, onSkip, onSaved, updateCopy }) {
  const { mainShelf, allSubs, alsoIn } = useMemo(() => shelfParts(copy, categories), [copy, categories])
  const [mainId, setMainId] = useState(mainShelf?.category_id ?? '')
  const [subIds, setSubIds] = useState(() => new Set(allSubs.map((s) => s.category_id)))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')

  const mains = categories.filter((c) => !c.parent_id)
  const { flags, suggestions } = copy.category_review
  // Suggestions were counted for the vote's main category, so they show only under it.
  const suggested = mainId === mainShelf?.category_id ? suggestions : []
  const score = (sub) => suggested.find((s) => s.sub === sub.name)?.score ?? 0
  const subOptions = categories.filter((c) => c.parent_id === mainId).sort((a, b) => score(b) - score(a) || a.position - b.position)
  const reasonsFor = (id) => copy.shelves.find((s) => s.category_id === id)?.reasons ?? []

  function toggle(id) {
    const next = new Set(subIds)
    if (!next.delete(id)) next.add(id)
    setSubIds(next)
  }

  async function save() {
    setSaving(true)
    setProblem('')
    try {
      await saveShelfDecision(copy, categories, mainId, subIds, updateCopy)
      onSaved()
    } catch (e) {
      setProblem(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="edit-book review-book">
      <h2>{copy.title}</h2>
      <p className="book-meta">
        {copy.byline} ·{' '}
        <button className="link" onClick={() => onOpenBook(copy.id)}>
          Book page
        </button>
      </p>
      <p className="review-note">{flags.map(flagText).join('; ')}</p>

      <label>
        Main category
        <select value={mainId} onChange={(e) => setMainId(e.target.value)}>
          {!mainShelf && <option value="">Choose one…</option>}
          {mains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {reasonsFor(mainId).map((reason) => (
        <p key={reason} className="diagnostic">
          Filed here because: {reason}
        </p>
      ))}
      {alsoIn.length > 0 && (
        <p className="diagnostic">Also in: {alsoIn.map((s) => nameOf(categories, s.category_id)).join(', ')}</p>
      )}

      {subOptions.length > 0 && (
        <>
          <h3>Subcategories</h3>
          <p className="diagnostic">Leave all unchecked if none fits.</p>
          {subOptions.map((sub) => (
            <div key={sub.id}>
              <label className="edit-check">
                <input type="checkbox" checked={subIds.has(sub.id)} onChange={() => toggle(sub.id)} />
                {sub.name}
                {score(sub) > 0 && <span className="book-meta">suggested, {score(sub)} {score(sub) === 1 ? 'point' : 'points'}</span>}
              </label>
              {copy.shelves.find((s) => s.category_id === sub.id)?.tentative && (
                <p className="diagnostic review-reasons">Tentative. {reasonsFor(sub.id).join('; ')}</p>
              )}
            </div>
          ))}
        </>
      )}

      <details className="review-clues">
        <summary>Cataloging details</summary>
        <ul className="subjects">
          {copy.dewey && <li>Dewey: {[copy.dewey, copy.dewey_wording.join('; ')].filter(Boolean).join(' — ')}</li>}
          {(copy.lc_call_number || copy.lcc) && <li>LC call number: {copy.lc_call_number || copy.lcc}</li>}
          {copy.lt_genres.length > 0 && <li>LibraryThing genres: {copy.lt_genres.join(', ')}</li>}
          {copy.headings.map((heading) => (
            <li key={heading}>{heading}</li>
          ))}
        </ul>
      </details>

      {problem && <p className="error">{problem}</p>}
      <div className="review-actions">
        <button className="link" onClick={onSkip} disabled={saving}>
          Skip for now
        </button>
        <button className="primary" onClick={save} disabled={saving || !mainId}>
          {saving ? 'Saving…' : 'Save and next'}
        </button>
      </div>
    </div>
  )
}

// Stays on the page (hidden) while a book page is open, so the chosen filter and
// any unsaved ticks are still there on coming back.
function CategoryReview({ place, copies, categories, onOpenPlace, onReplacePlace, onOpenBook, onBack, updateCopy }) {
  // The dashboard's "No main category yet" opens it on that filter.
  const [filterId, setFilterId] = useState(place.filter ?? 'all')
  const filter = REVIEW_FILTERS.find((f) => f.id === filterId)
  const reviewable = useMemo(() => copies.filter((c) => c.category_review), [copies])
  const books = useMemo(
    () => reviewable.filter((c) => inFilter(c, filter)).sort((a, b) => a.titleSort.localeCompare(b.titleSort)),
    [reviewable, filter],
  )
  // Runs from the screen as it was when the button was tapped, so a book just
  // saved still has its place in this list.
  function moveOn(afterId) {
    const next = books[books.findIndex((c) => c.id === afterId) + 1]
    if (next) onReplacePlace({ kind: 'review', id: next.id })
    else onBack()
  }

  const backBar = (
    <div className="pinned-back">
      <button className="link" onClick={onBack}>
        ‹ Back
      </button>
    </div>
  )

  if (place.id) {
    const copy = copies.find((c) => c.id === place.id)
    return (
      <div className="series-view">
        {backBar}
        {copy?.category_review ? (
          <ReviewBook
            key={copy.id}
            copy={copy}
            categories={categories}
            onOpenBook={onOpenBook}
            onSkip={() => moveOn(copy.id)}
            onSaved={() => moveOn(copy.id)}
            updateCopy={updateCopy}
          />
        ) : (
          <p className="placeholder">This book isn't on the review list now.</p>
        )}
      </div>
    )
  }

  return (
    <div className="series-view">
      {backBar}
      <h2>Review categories</h2>
      <p className="book-meta">{reviewable.length} {reviewable.length === 1 ? 'book' : 'books'} left</p>
      <div className="review-filters">
        {REVIEW_FILTERS.map((f) => (
          <button key={f.id} className={f.id === filterId ? 'chip active' : 'chip'} onClick={() => setFilterId(f.id)}>
            {f.label} ({reviewable.filter((c) => inFilter(c, f)).length})
          </button>
        ))}
      </div>
      {books.length === 0 && <p className="placeholder">Nothing left here.</p>}
      <BookList
        books={books.map((c) => ({ ...c, listLine: `${c.byline} · ${shelfLine(c, categories)}` }))}
        onOpenBook={(id) => onOpenPlace('review', id)}
      />
    </div>
  )
}

export default CategoryReview
