import { useLayoutEffect, useRef, useState } from 'react'
import { formFromCopy, formProblem, removeBook, saveBookEdits } from './bookEdits.js'

function Field({ label, value, onChange, numeric }) {
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

// A text box that grows to show all of a long title. Pressing return saves
// rather than starting a new line, and a pasted line break becomes a space.
function TitleField({ label, value, onChange }) {
  const box = useRef(null)

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

// Edit one copy (mockup screen 8). Categories and Use my location come later.
function EditBook({ copy, sharedWork, onCancel, onSaved, onRemoved, updateCopy, updateWork }) {
  const [form, setForm] = useState(() => formFromCopy(copy))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setPerson = (i, key) => (value) =>
    setForm((f) => ({ ...f, people: f.people.map((p, n) => (n === i ? { ...p, [key]: value } : p)) }))

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
      await saveBookEdits(copy, form, sharedWork, { onCopy: updateCopy, onWork: updateWork })
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
        <div className="edit-pair" key={i}>
          <Field
            label={person.role === 'Author' ? 'Author last name' : `${person.role} last name`}
            value={person.last}
            onChange={setPerson(i, 'last')}
          />
          <Field label="First name" value={person.first} onChange={setPerson(i, 'first')} />
        </div>
      ))}
      <div className="edit-pair">
        <Field label="First published" value={form.firstPublished} onChange={set('firstPublished')} numeric />
        <Field label="Pages" value={form.pages} onChange={set('pages')} numeric />
      </div>

      <h3>From the bookplate</h3>
      <div className="edit-pair">
        <Field label="Year acquired" value={form.acquiredYear} onChange={set('acquiredYear')} numeric />
        <Field label="City" value={form.city} onChange={set('city')} />
        <Field label="State / region" value={form.region} onChange={set('region')} />
        <Field label="Country" value={form.country} onChange={set('country')} />
      </div>

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
