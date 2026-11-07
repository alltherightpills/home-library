import { useMemo, useState } from 'react'
import { filterPeople, nameParts, peopleIn, renamePlan } from './authors.js'
import { renameAuthor } from './bookEdits.js'
import BookList from './BookList.jsx'
import { BackBar, Row } from './CategoryView.jsx'
import { Field } from './EditBook.jsx'
import { SORTS } from './useCatalog.js'

const bookCount = (n) => `${n.toLocaleString()} ${n === 1 ? 'book' : 'books'}`
// "Author" goes without saying; other roles are shown ("Translator").
const rolesText = (roles) => (roles.length === 1 && roles[0] === 'Author' ? '' : roles.join(', '))

// Manage › Authors: everyone credited on a book, A to Z, with a box to narrow
// the list. What's typed is kept in the history, so coming back from a person
// shows the same list.
export function AuthorsList({ place, copies, onOpenPlace, onReplacePlace, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const query = place.q ?? ''
  const shown = useMemo(() => filterPeople(people, query), [people, query])
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Manage" />
      <h2>Authors</h2>
      <p className="book-meta">
        {people.length.toLocaleString()} people, including translators, illustrators and editors. Tap one to rename
        them on every book.
      </p>
      <input
        type="search"
        className="search"
        placeholder="Find a name"
        aria-label="Find a name"
        autoComplete="off"
        value={query}
        onChange={(e) => onReplacePlace({ ...place, q: e.target.value })}
      />
      {query.trim() && <p className="diagnostic">{shown.length.toLocaleString()} matching</p>}
      <ul className="category-rows">
        {shown.map(({ author, roles, books }) => (
          <Row
            key={author.id}
            name={author.sort_name}
            detail={rolesText(roles)}
            count={bookCount(books.length)}
            onOpen={() => onOpenPlace('author', author.id)}
          />
        ))}
      </ul>
    </div>
  )
}

// One person: their books, and Rename, which changes the name on all of them.
export function PersonPage({ place, copies, updateAuthor, onOpenBook, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const person = people.find((p) => p.author.id === place.id)
  const [renaming, setRenaming] = useState(false)
  const books = useMemo(() => (person ? [...person.books].sort(SORTS.title) : []), [person])

  if (!person) {
    return (
      <div className="series-view manage-people">
        <BackBar onBack={onBack} label="Authors" />
        <p className="book-meta">This person is no longer on any book.</p>
      </div>
    )
  }
  const { author, roles } = person
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Authors" />
      <h2>{author.display_name}</h2>
      <p className="book-meta">
        Filed as {author.sort_name}
        {rolesText(roles) && ` · ${rolesText(roles)}`} · {bookCount(books.length)}
      </p>
      {renaming ? (
        <RenameForm
          key={author.sort_name}
          person={person}
          people={people}
          onSaved={(renamed) => {
            updateAuthor(renamed)
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <p>
          <button className="link strong" onClick={() => setRenaming(true)}>
            Rename on every book
          </button>
        </p>
      )}
      <BookList books={books} onOpenBook={onOpenBook} />
    </div>
  )
}

function RenameForm({ person, people, onSaved, onCancel }) {
  const { author, books } = person
  const [name, setName] = useState(() => nameParts(author.sort_name))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const plan = renamePlan(people, author, name)
  const other = (a) => people.find((p) => p.author.id === a.id)
  const canSave = !busy && !plan.problem && !plan.unchanged && !plan.same

  async function save(e) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError('')
    try {
      onSaved(await renameAuthor(author.id, plan.forms))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="edit-book rename-person" onSubmit={save} noValidate>
      <div className="edit-pair">
        <Field label="Last name" value={name.last} onChange={(last) => setName({ ...name, last })} />
        <Field label="First name" value={name.first} onChange={(first) => setName({ ...name, first })} />
      </div>
      {plan.problem && <p className="error">{plan.problem}</p>}
      {plan.same ? (
        <p className="error">
          {plan.same.sort_name} is already in the catalog ({bookCount(other(plan.same)?.books.length ?? 0)}). If
          they're the same person, merging the two comes in the next update.
        </p>
      ) : plan.alike ? (
        <p className="book-meta">
          You also have <strong>{plan.alike.sort_name}</strong> ({bookCount(other(plan.alike)?.books.length ?? 0)}).
          Same person? If so, merge them instead (coming next) so they become one.
        </p>
      ) : null}
      {!plan.problem && !plan.unchanged && (
        <p className="book-meta">
          Shown as <strong>{plan.forms.display_name}</strong>, filed as <strong>{plan.forms.sort_name}</strong>, on{' '}
          {books.length === 1 ? 'its 1 book' : `all ${books.length.toLocaleString()} books`}.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="controls">
        <button type="submit" className="primary" disabled={!canSave}>
          {busy ? 'Saving…' : 'Rename'}
        </button>
        <button type="button" className="link" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
