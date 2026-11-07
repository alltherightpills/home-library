import { useEffect, useMemo, useState } from 'react'
import { filterPeople, nameParts, pairOf, peopleIn, possibleDuplicates, renamePlan } from './authors.js'
import { loadNotSame, markNotSame, mergeAuthorsInto, renameAuthor } from './bookEdits.js'
import BookList from './BookList.jsx'
import { BackBar, Row } from './CategoryView.jsx'
import { Field } from './EditBook.jsx'
import { SORTS } from './useCatalog.js'

const bookCount = (n) => `${n.toLocaleString()} ${n === 1 ? 'book' : 'books'}`
// "Author" goes without saying; other roles are shown ("Translator").
const rolesText = (roles) => (roles.length === 1 && roles[0] === 'Author' ? '' : roles.join(', '))

// Who each merged-away person became, for this session: going back to a
// merged-away person's page shows the person they were merged into.
const mergedInto = new Map()
const current = (id) => (mergedInto.has(id) ? current(mergedInto.get(id)) : id)

// The pairs checked and found different, loaded fresh each time a screen
// needs them (a small list). `keys` is null while loading.
function useNotSame() {
  const [state, setState] = useState({ keys: null, error: '' })
  useEffect(() => {
    let cancelled = false
    loadNotSame().then(
      (keys) => !cancelled && setState({ keys: new Set(keys), error: '' }),
      (e) => !cancelled && setState({ keys: null, error: e.message }),
    )
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

// Manage › Authors: everyone credited on a book, A to Z, with a box to narrow
// the list. What's typed is kept in the history, so coming back from a person
// shows the same list.
export function AuthorsList({ place, copies, onOpenPlace, onReplacePlace, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const notSame = useNotSame()
  const groups = useMemo(() => (notSame.keys ? possibleDuplicates(people, notSame.keys) : null), [people, notSame.keys])
  const query = place.q ?? ''
  const shown = useMemo(() => filterPeople(people, query), [people, query])
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Manage" />
      <h2>Authors</h2>
      <p className="book-meta">
        {people.length.toLocaleString()} people, including translators, illustrators and editors. Tap one to rename
        them on every book or merge them with someone.
      </p>
      <ul className="category-rows">
        <Row
          name="Possible duplicates"
          detail="Same surname and first initial"
          count={groups ? `${groups.length} to check` : notSame.error ? 'unavailable' : '…'}
          onOpen={() => onOpenPlace('duplicates')}
        />
      </ul>
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
      <PeopleRows people={shown} onOpen={(p) => onOpenPlace('author', p.author.id)} />
    </div>
  )
}

function PeopleRows({ people, onOpen }) {
  return (
    <ul className="category-rows">
      {people.map((p) => (
        <Row
          key={p.author.id}
          name={p.author.sort_name}
          detail={rolesText(p.roles)}
          count={bookCount(p.books.length)}
          onOpen={() => onOpen(p)}
        />
      ))}
    </ul>
  )
}

// One person: their books, Rename (on all of them), and Merge with another person.
export function PersonPage({ place, copies, updateAuthor, onOpenPlace, onOpenBook, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const person = people.find((p) => p.author.id === current(place.id))
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
          onMerge={(other) => onOpenPlace('merge', null, { ids: [other.id, author.id], keep: other.id })}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <p className="controls">
          <button className="link strong" onClick={() => setRenaming(true)}>
            Rename on every book
          </button>
          <button className="link strong" onClick={() => onOpenPlace('mergePick', author.id)}>
            Merge with another person…
          </button>
        </p>
      )}
      <BookList books={books} onOpenBook={onOpenBook} />
    </div>
  )
}

function RenameForm({ person, people, onSaved, onMerge, onCancel }) {
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
        <>
          <p className="error">
            {plan.same.sort_name} is already in the catalog ({bookCount(other(plan.same)?.books.length ?? 0)}). Two
            people can't share a name: if they're the same person, merge them.
          </p>
          <button type="button" className="primary" onClick={() => onMerge(plan.same)}>
            Merge into {plan.same.sort_name}…
          </button>
        </>
      ) : plan.alike ? (
        <p className="book-meta">
          You also have <strong>{plan.alike.sort_name}</strong> ({bookCount(other(plan.alike)?.books.length ?? 0)}).
          Same person?{' '}
          <button type="button" className="link" onClick={() => onMerge(plan.alike)}>
            Merge them instead
          </button>
        </p>
      ) : null}
      {!plan.problem && !plan.unchanged && !plan.same && (
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

// Possible duplicates: groups of people sharing a surname and first initial,
// until each is merged or checked as different.
export function DuplicatesList({ copies, onOpenPlace, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const notSame = useNotSame()
  const groups = useMemo(() => (notSame.keys ? possibleDuplicates(people, notSame.keys) : null), [people, notSame.keys])
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Authors" />
      <h2>Possible duplicates</h2>
      <p className="book-meta">
        People with the same surname and first initial, ignoring accents. Tap a group to merge them or mark them as
        different people; either way it leaves this list.
      </p>
      {notSame.error && <p className="error">{notSame.error}</p>}
      {!groups ? (
        !notSame.error && <p className="book-meta">Loading…</p>
      ) : groups.length === 0 ? (
        <p>Nothing left to check.</p>
      ) : (
        <ul className="category-rows">
          {groups.map((group) => (
            <Row
              key={group.map((p) => p.author.id).join()}
              name={group.map((p) => p.author.sort_name).join(' · ')}
              count={bookCount(group.reduce((n, p) => n + p.books.length, 0))}
              onOpen={() => onOpenPlace('merge', null, { ids: group.map((p) => p.author.id) })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// Merge with another person: find them by name. Picking one moves on to the
// merge screen in this step's place, so Back skips the picker.
export function MergePick({ place, copies, onReplacePlace, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const person = people.find((p) => p.author.id === current(place.id))
  const query = place.q ?? ''
  const shown = useMemo(
    () => (query.trim() ? filterPeople(people, query).filter((p) => p !== person) : []),
    [people, query, person],
  )
  if (!person) return <PersonGone onBack={onBack} />
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label={person.author.sort_name} />
      <h2>Merge {person.author.sort_name} with…</h2>
      <input
        type="search"
        className="search"
        placeholder="Find the other name"
        aria-label="Find the other name"
        autoComplete="off"
        value={query}
        onChange={(e) => onReplacePlace({ ...place, q: e.target.value })}
      />
      {query.trim() && <p className="diagnostic">{shown.length.toLocaleString()} matching</p>}
      <PeopleRows
        people={shown}
        onOpen={(p) => onReplacePlace({ kind: 'merge', ids: [person.author.id, p.author.id] })}
      />
    </div>
  )
}

function PersonGone({ onBack }) {
  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Back" />
      <p className="book-meta">This person is no longer on any book.</p>
    </div>
  )
}

// Same person? Pick the name to keep, and (in a group of three or more) who's
// included. Merging moves every book to the kept name in one database step;
// anyone left out is remembered as different from the kept person. "Different
// people" remembers every pair in the group.
export function MergeScreen({ place, copies, mergeAuthors, onBack }) {
  const people = useMemo(() => peopleIn(copies), [copies])
  const group = useMemo(() => {
    const ids = [...new Set(place.ids.map(current))]
    return ids.map((id) => people.find((p) => p.author.id === id)).filter(Boolean)
  }, [place.ids, people])
  const [keepId, setKeepId] = useState(() => (place.keep && current(place.keep)) ?? group[0]?.author.id)
  const [left, setLeft] = useState(() => new Set()) // ids ticked off as not the same
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const libraryId = copies[0]?.library_id

  if (group.length < 2) return <PersonGone onBack={onBack} />
  const keep = group.find((p) => p.author.id === keepId) ?? group[0]
  const others = group.filter((p) => p !== keep)
  const merging = others.filter((p) => !left.has(p.author.id))
  const ticks = group.length > 2

  async function run(job) {
    setBusy(true)
    setError('')
    try {
      await job()
      onBack()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const merge = () =>
    run(async () => {
      const dropIds = merging.map((p) => p.author.id)
      await mergeAuthorsInto(keep.author.id, dropIds)
      for (const id of dropIds) mergedInto.set(id, keep.author.id)
      mergeAuthors(keep.author, dropIds)
      // Left out of the merge: not the same as the kept person. If this fails,
      // the merge still stands and the group just shows again.
      const notKept = others.filter((p) => left.has(p.author.id))
      await markNotSame(libraryId, notKept.map((p) => pairOf(keep.author.id, p.author.id))).catch(() => {})
    })

  const different = () =>
    run(() =>
      markNotSame(
        libraryId,
        group.flatMap((a, i) => group.slice(i + 1).map((b) => pairOf(a.author.id, b.author.id))),
      ),
    )

  return (
    <div className="series-view manage-people">
      <BackBar onBack={onBack} label="Back" />
      <h2>Same person?</h2>
      <p className="book-meta">
        {ticks
          ? 'Pick the name to keep, and untick anyone who is a different person.'
          : 'Pick the name to keep. Every book moves to it, and the other name is removed.'}
      </p>
      <ul className="merge-people">
        {group.map((p) => {
          const kept = p === keep
          const titles = [...p.books].sort(SORTS.title).map((b) => b.title)
          return (
            <li key={p.author.id} className={kept ? 'kept' : undefined}>
              <label className="merge-keep">
                <input type="radio" name="keep" checked={kept} onChange={() => setKeepId(p.author.id)} disabled={busy} />
                <span>
                  <strong>{p.author.sort_name}</strong>
                  {rolesText(p.roles) && ` (${rolesText(p.roles)})`} · {bookCount(p.books.length)}
                  {kept && <span className="book-meta"> · keep this name</span>}
                </span>
              </label>
              <p className="book-meta merge-titles">
                {titles.slice(0, 4).join(' · ')}
                {titles.length > 4 && ` · and ${titles.length - 4} more`}
              </p>
              {ticks && !kept && (
                <label className="edit-check">
                  <input
                    type="checkbox"
                    checked={!left.has(p.author.id)}
                    disabled={busy}
                    onChange={(e) => {
                      const next = new Set(left)
                      if (e.target.checked) next.delete(p.author.id)
                      else next.add(p.author.id)
                      setLeft(next)
                    }}
                  />
                  Same person as {keep.author.sort_name}
                </label>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="error">{error}</p>}
      <div className="controls">
        <button className="primary" onClick={merge} disabled={busy || !merging.length}>
          {busy ? 'Saving…' : `Merge ${merging.length === 1 ? merging[0].author.sort_name : `${merging.length} people`} into ${keep.author.sort_name}`}
        </button>
      </div>
      <p>
        <button className="link" onClick={different} disabled={busy}>
          {group.length === 2 ? 'They’re different people' : 'They’re all different people'}
        </button>
      </p>
    </div>
  )
}
