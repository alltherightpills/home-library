import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { authorMatches, authorsIn } from './addBook.js'
import { EVERY_QUESTION_ANSWERS, QUESTIONS, answerWords } from './assessments.js'
import { blankPerson, formFromCopy, formProblem, nameParts, removeBook, saveBookEdits } from './bookEdits.js'
import { nameChanged, rolesFor } from './peopleEdits.js'
import { labelNames } from './series.js'

// iPhones ignore autoComplete="off" on boxes labeled like a contact form, but
// tend to skip autofill when a box's hidden name contains "search".
function useNoAutofillName() {
  return `search-${useId()}`
}

export function Field({ label, value, onChange, numeric, list }) {
  const name = useNoAutofillName()
  return (
    <label>
      {label}
      <input
        type="text"
        name={name}
        inputMode={numeric ? 'numeric' : undefined}
        list={list}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

// A text box that grows to show all of a long title. Pressing return saves
// rather than starting a new line, and a pasted line break becomes a space.
export function TitleField({ label, value, onChange }) {
  const box = useRef(null)
  const name = useNoAutofillName()

  useLayoutEffect(() => {
    box.current.style.height = 'auto'
    box.current.style.height = `${box.current.offsetHeight - box.current.clientHeight + box.current.scrollHeight}px`
  }, [value])

  return (
    <label>
      {label}
      <textarea
        ref={box}
        rows={1}
        name={name}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.form.requestSubmit()
          }
        }}
      />
    </label>
  )
}

// Under a typed name (the check form, and Edit a Book): whether that person is
// already in the library, and others with the same last name to pick instead,
// so a misspelling doesn't add a second copy of someone.
export function AuthorNote({ authors, person, onUse }) {
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

// Series or publisher's series: a name (with suggestions from the shared list)
// and the number printed on this book, with room for more than one.
export function LabelRows({ label, rows, names, onChange }) {
  const listId = useId()
  const setRow = (i, key) => (value) => onChange(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)))
  return (
    <>
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {rows.map((row, i) => (
        <div className="edit-label" key={i}>
          <Field label={label} value={row.name} onChange={setRow(i, 'name')} list={listId} />
          <Field label="Number" value={row.number} onChange={setRow(i, 'number')} />
        </div>
      ))}
      <button type="button" className="link edit-add" onClick={() => onChange([...rows, { name: '', number: '' }])}>
        + Add another
      </button>
    </>
  )
}


function SubcategoryBoxes({ parentId, categories, subIds, onToggle }) {
  const subs = categories.filter((c) => c.parent_id === parentId)
  return subs.map((sub) => (
    <label className="edit-check" key={sub.id}>
      <input type="checkbox" checked={subIds.has(sub.id)} onChange={() => onToggle(sub.id)} />
      {sub.name}
    </label>
  ))
}

// The main category, its subcategories, and any others the book is also in.
export function CategoryFields({ shelves, categories, onChange }) {
  const { mainId, alsoIds, subIds } = shelves
  const mains = categories.filter((c) => !c.parent_id)
  const flipped = (ids, id) => {
    const next = new Set(ids)
    if (!next.delete(id)) next.add(id)
    return next
  }
  const toggleSub = (id) => onChange({ ...shelves, subIds: flipped(subIds, id) })
  function chooseMain(id) {
    const next = new Set(alsoIds)
    next.delete(id)
    onChange({ ...shelves, mainId: id, alsoIds: next })
  }
  return (
    <>
      <label>
        Main category
        <select value={mainId} onChange={(e) => chooseMain(e.target.value)}>
          {!mainId && <option value="">Choose one…</option>}
          {mains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <SubcategoryBoxes parentId={mainId} categories={categories} subIds={subIds} onToggle={toggleSub} />
      <h4>Also in</h4>
      {mains
        .filter((c) => c.id !== mainId)
        .map((c) => (
          <div className="edit-also" key={c.id}>
            <label className="edit-check">
              <input
                type="checkbox"
                checked={alsoIds.has(c.id)}
                onChange={() => onChange({ ...shelves, alsoIds: flipped(alsoIds, c.id) })}
              />
              {c.name}
            </label>
            {alsoIds.has(c.id) && (
              <div className="edit-also-subs">
                <SubcategoryBoxes parentId={c.id} categories={categories} subIds={subIds} onToggle={toggleSub} />
              </div>
            )}
          </div>
        ))}
    </>
  )
}

// Pick for me's judged questions (assessment-guide.md), one menu each. Under
// Claude's answers, a note says whose they are; changing one makes it the
// owner's, which no assessment pass replaces.
const JUDGED_LABELS = {
  international: 'View (international or domestic)',
  driven: 'Driven (stories: character or plot; nonfiction: narrative or ideas)',
  pace: 'Pace',
  mood: 'Mood',
}

function JudgedFields({ rows = [], judged, onChange }) {
  return QUESTIONS.map((q) => {
    const stored = rows.find((r) => r.question === q.id)
    const untouched = stored && judged[q.id] === stored.answer
    return (
      <div className="edit-judged" key={q.id}>
        <label>
          {JUDGED_LABELS[q.id]}
          <select value={judged[q.id]} onChange={(e) => onChange({ ...judged, [q.id]: e.target.value })}>
            <option value="">Not answered</option>
            {[...q.answers, ...EVERY_QUESTION_ANSWERS].map((a) => (
              <option key={a} value={a}>
                {answerWords(a)}
              </option>
            ))}
          </select>
        </label>
        {untouched && stored.set_by === 'claude' && (
          <p className="book-meta edit-judged-note">{stored.sure ? 'Claude’s answer' : 'Claude’s guess (unsure)'}</p>
        )}
      </div>
    )
  })
}

// Edit one copy (mockup screen 8). Use my location comes later.
function EditBook({ copy, copies, categories, sharedWork, onCancel, onSaved, onRemoved, updateCopy, updateWork }) {
  const [form, setForm] = useState(() => formFromCopy(copy, categories))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const seriesNames = useMemo(() => labelNames(copies, 'series'), [copies])
  const authors = useMemo(() => authorsIn(copies), [copies])
  const publisherSeriesNames = useMemo(() => labelNames(copies, 'publisherSeries'), [copies])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setPerson = (i, key) => (value) =>
    setForm((f) => ({ ...f, people: f.people.map((p, n) => (n === i ? { ...p, [key]: value } : p)) }))
  // Taken off this book when saved (the person stays on any other books).
  const removePerson = (i) => setForm((f) => ({ ...f, people: f.people.filter((_, n) => n !== i) }))

  async function save(e) {
    e.preventDefault()
    const problem = formProblem(form, copy)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveBookEdits(copy, form, sharedWork, categories, { onCopy: updateCopy, onWork: updateWork })
      onSaved()
    } catch (err) {
      setError(`Couldn't save everything: ${err.message} Tap Save to try again.`)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await removeBook(copy)
      onRemoved()
    } catch (err) {
      setError(`Couldn't remove the book: ${err.message}`)
      setBusy(false)
    }
  }

  return (
    <form className="edit-book" onSubmit={save} noValidate>
      <div className="edit-header">
        <button type="button" className="link" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <h2>Edit book</h2>
        <button type="submit" className="link strong" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <h3>Details</h3>
      <TitleField label="Title" value={form.title} onChange={set('title')} />
      {form.people.map((person, i) => (
        <div className="edit-person" key={i}>
          <div className="edit-pair">
            <Field
              label={person.role === 'Author' ? 'Author last name' : `${person.role} last name`}
              value={person.last}
              onChange={setPerson(i, 'last')}
            />
            <Field label="First name" value={person.first} onChange={setPerson(i, 'first')} />
          </div>
          {nameChanged(person) && (
            <AuthorNote authors={authors} person={person} onUse={(name) => setForm((f) => ({ ...f, people: f.people.map((p, n) => (n === i ? { ...p, ...name } : p)) }))} />
          )}
          <div className="edit-person-actions">
            <label>
              Role{' '}
              <select value={person.role} onChange={(e) => setPerson(i, 'role')(e.target.value)}>
                {rolesFor(person.role).map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <button type="button" className="link" onClick={() => removePerson(i)}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="link edit-add" onClick={() => setForm((f) => ({ ...f, people: [...f.people, blankPerson()] }))}>
        + Add a person
      </button>
      <div className="edit-pair">
        <Field label="First published" value={form.firstPublished} onChange={set('firstPublished')} numeric />
        <Field label="Pages" value={form.pages} onChange={set('pages')} numeric />
      </div>
      <LabelRows label="Series" rows={form.series} names={seriesNames} onChange={set('series')} />

      <h3>Categories</h3>
      <CategoryFields shelves={form.shelves} categories={categories} onChange={set('shelves')} />
      <label>
        Audience
        <select value={form.audience} onChange={(e) => set('audience')(e.target.value)}>
          {!form.audience && <option value="">Not set</option>}
          <option>Adult</option>
          <option>Teen</option>
          <option>Kids</option>
        </select>
      </label>
      <label>
        Location
        <select value={form.location} onChange={(e) => set('location')(e.target.value)}>
          <option>Home</option>
          <option>Office</option>
        </select>
      </label>

      <h3>Pick for me</h3>
      <TitleField label="Synopsis (one sentence)" value={form.synopsis} onChange={set('synopsis')} />
      <JudgedFields rows={copy.work?.assessments} judged={form.judged} onChange={set('judged')} />

      <h3>This edition</h3>
      <Field label="Publisher" value={form.publisher} onChange={set('publisher')} />
      <div className="edit-pair">
        <Field label="Edition year" value={form.editionYear} onChange={set('editionYear')} numeric />
        <label>
          Binding
          <select value={form.binding} onChange={(e) => set('binding')(e.target.value)}>
            <option value="">Not set</option>
            <option>Paperback</option>
            <option>Hardcover</option>
          </select>
        </label>
        <Field label="ISBN-13" value={form.isbn13} onChange={set('isbn13')} numeric />
        <Field label="ISBN-10" value={form.isbn10} onChange={set('isbn10')} />
      </div>
      <Field label="Language (commas between several)" value={form.languages} onChange={set('languages')} />
      <LabelRows
        label="Publisher's series"
        rows={form.publisherSeries}
        names={publisherSeriesNames}
        onChange={set('publisherSeries')}
      />
      <Field label="Edition note" value={form.editionNote} onChange={set('editionNote')} />

      <h3>From the bookplate</h3>
      <div className="edit-pair">
        <Field label="Year acquired" value={form.acquiredYear} onChange={set('acquiredYear')} numeric />
        <Field label="City" value={form.city} onChange={set('city')} />
        <Field label="State / region" value={form.region} onChange={set('region')} />
        <Field label="Country" value={form.country} onChange={set('country')} />
      </div>

      <h3>Notes</h3>
      <TitleField label="Notes (a box set's contents, for example)" value={form.notes} onChange={set('notes')} />

      <h3>Needs checking</h3>
      <label className="edit-check">
        <input
          type="checkbox"
          checked={form.needsReview}
          onChange={(e) => set('needsReview')(e.target.checked)}
        />
        Flag this book to check later
      </label>
      {form.needsReview && (
        <Field label="What to check (optional)" value={form.reviewNote} onChange={set('reviewNote')} />
      )}

      {confirmingRemove ? (
        <div className="confirm-remove">
          <p>
            Remove <strong>{copy.title}</strong> from your library? This can't be undone here. Only a backup could bring
            it back.
          </p>
          <button type="button" className="danger filled" onClick={remove} disabled={busy}>
            Yes, remove it
          </button>
          <button type="button" className="link" onClick={() => setConfirmingRemove(false)} disabled={busy}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" className="danger" onClick={() => setConfirmingRemove(true)} disabled={busy}>
          Remove from library
        </button>
      )}
    </form>
  )
}

export default EditBook
