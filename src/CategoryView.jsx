import { useMemo } from 'react'
import BookList, { ReadFilter, SortSelect, ViewToggle } from './BookList.jsx'
import { booksOn, shelfCounts } from './categories/browse.js'
import { byRead, countText } from './readings.js'
import { SORTS } from './useCatalog.js'

export function BackBar({ onBack, label = 'Back' }) {
  return (
    <div className="pinned-back">
      <button className="link" onClick={onBack}>
        ‹ {label}
      </button>
    </div>
  )
}

// One tappable row: a name and its count. `indent` steps it in (1 or 2, for
// an outline); `detail` is a gray line under the name; `count` may be text.
export function Row({ name, count, onOpen, muted, indent = 0, detail, letter }) {
  return (
    <li className={indent ? `indent-${indent}` : undefined} data-letter={letter}>
      <button onClick={onOpen}>
        <span>
          <span className={muted ? 'book-meta' : 'category-name'}>{name}</span>
          {detail && <span className="book-meta row-detail">{detail}</span>}
        </span>
        <span className="book-meta">{count.toLocaleString()} ›</span>
      </button>
    </li>
  )
}

// The dashboard's main categories, with how many books each is the main shelf of.
export function CategoryRows({ copies, categories, onOpenPlace }) {
  const counts = useMemo(() => shelfCounts(copies, categories), [copies, categories])
  const mains = categories.filter((c) => !c.parent_id)
  return (
    <ul className="category-rows">
      {mains.map((c) => (
        <Row key={c.id} name={c.name} count={counts.main.get(c.id) ?? 0} onOpen={() => onOpenPlace('category', c.id)} />
      ))}
      {counts.noMain > 0 && (
        <Row
          name="No main category yet"
          count={counts.noMain}
          muted
          onOpen={() => onOpenPlace('review', undefined, { filter: 'noMain' })}
        />
      )}
    </ul>
  )
}

// A list of books on a shelf, with the sort control.
function ShelfList({ entries, sort, setSort, view, setView, readFilter, setReadFilter, onOpenBook, alsoInName }) {
  const alsoIn = new Set(entries.filter((e) => e.alsoIn).map((e) => e.copy.id))
  const books = entries.map((e) => e.copy).sort(SORTS[sort])
  return (
    <>
      <div className="controls">
        <SortSelect sort={sort} setSort={setSort} />
        <ViewToggle view={view} setView={setView} />
        <ReadFilter filter={readFilter} setFilter={setReadFilter} />
      </div>
      <BookList books={books} onOpenBook={onOpenBook} view={view} letters={sort} noteFor={(c) => alsoIn.has(c.id) && `Also in ${alsoInName}`} />
    </>
  )
}

// A main category: its count, Browse all, and its subcategories, most books
// first. A category with no subcategories goes straight to its books.
function CategoryPage({ id, copies, categories, sort, setSort, view, setView, readFilter, setReadFilter, onOpenPlace, onOpenBook, onBack }) {
  const counts = useMemo(() => shelfCounts(copies, categories), [copies, categories])
  const category = categories.find((c) => c.id === id)
  const subs = categories
    .filter((c) => c.parent_id === id && counts.sub.get(c.id))
    .sort((a, b) => counts.sub.get(b.id) - counts.sub.get(a.id) || a.position - b.position)
  const hasSubs = categories.some((c) => c.parent_id === id)
  const entries = useMemo(() => (hasSubs ? [] : booksOn(copies, categories, id)), [hasSubs, copies, categories, id])
  if (!category) return <BackBar onBack={onBack} />

  const main = counts.main.get(id) ?? 0
  const also = counts.also.get(id) ?? 0
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="My Library" />
      <h2>{category.name}</h2>
      <p className="book-meta">
        {countText(main, readFilter)}
        {also > 0 && ` · plus ${also} also in ${category.name}`}
      </p>
      {hasSubs ? (
        <>
          <div className="controls">
            <ReadFilter filter={readFilter} setFilter={setReadFilter} />
          </div>
          <button className="primary browse-all" onClick={() => onOpenPlace('shelf', id)}>
            Browse all {(main + also).toLocaleString()} ›
          </button>
          <h3 className="section-label">Subcategories</h3>
          <ul className="category-rows">
            {subs.map((c) => (
              <Row key={c.id} name={c.name} count={counts.sub.get(c.id)} onOpen={() => onOpenPlace('shelf', c.id)} />
            ))}
            {(counts.noSub.get(id) ?? 0) > 0 && (
              <Row name="No subcategory" count={counts.noSub.get(id)} muted onOpen={() => onOpenPlace('noSub', id)} />
            )}
          </ul>
          <p className="book-meta">A book can be in several subcategories, but {category.name} counts it once.</p>
        </>
      ) : (
        <ShelfList
          entries={entries}
          sort={sort}
          setSort={setSort}
          view={view}
          setView={setView}
          readFilter={readFilter}
          setReadFilter={setReadFilter}
          onOpenBook={onOpenBook}
          alsoInName={category.name}
        />
      )}
    </div>
  )
}

// The books on one shelf: a main category (with its "also in" books), a
// subcategory, or (noSub) a main category's books with no subcategory.
function ShelfBooks({ id, noSub, copies, categories, sort, setSort, view, setView, readFilter, setReadFilter, onOpenBook, onBack }) {
  const entries = useMemo(() => booksOn(copies, categories, id, { noSub }), [copies, categories, id, noSub])
  const category = categories.find((c) => c.id === id)
  if (!category) return <BackBar onBack={onBack} />
  const parent = categories.find((c) => c.id === category.parent_id)
  const also = entries.filter((e) => e.alsoIn).length
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label={parent?.name ?? category.name} />
      {parent && <p className="book-meta">{parent.name} ›</p>}
      <h2>{noSub ? `${category.name}: no subcategory` : category.name}</h2>
      <p className="book-meta">
        {countText(entries.length - also, readFilter)}
        {also > 0 && (parent ? ` · plus ${also} whose main shelf is elsewhere` : ` · plus ${also} also in ${category.name}`)}
      </p>
      <ShelfList
        entries={entries}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={setView}
        readFilter={readFilter}
        setReadFilter={setReadFilter}
        onOpenBook={onOpenBook}
        alsoInName={parent ? `${parent.name} › ${category.name}` : category.name}
      />
    </div>
  )
}

// Every book, with the Needs checking and Not walked yet filters, one at a time
// (kept in the place, so it's still on after visiting a book).
const ALL_FILTERS = {
  flagged: { label: 'Needs checking', keep: (c) => c.needs_review },
  unwalked: { label: 'Not walked yet', keep: (c) => !c.shelf_walked_on },
}

function AllBooks({ filter, copies, sort, setSort, view, setView, readFilter, setReadFilter, onOpenBook, onReplacePlace, onBack }) {
  const keep = ALL_FILTERS[filter]?.keep
  const books = useMemo(() => (keep ? copies.filter(keep) : [...copies]).sort(SORTS[sort]), [copies, keep, sort])
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="My Library" />
      <h2>{ALL_FILTERS[filter] ? `All books: ${ALL_FILTERS[filter].label.toLowerCase()}` : 'All books'}</h2>
      <p className="book-meta">{countText(books.length, readFilter)}</p>
      <div className="controls">
        <SortSelect sort={sort} setSort={setSort} />
        <ViewToggle view={view} setView={setView} />
        <ReadFilter filter={readFilter} setFilter={setReadFilter} />
        {Object.entries(ALL_FILTERS).map(([id, { label, keep: test }]) => {
          const count = copies.filter(test).length
          if (!count && filter !== id) return null
          return (
            <button
              key={id}
              className={filter === id ? 'chip active' : 'chip'}
              onClick={() => onReplacePlace(filter === id ? { kind: 'all' } : { kind: 'all', id })}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>
      <BookList books={books} onOpenBook={onOpenBook} view={view} letters={sort} />
    </div>
  )
}

// The category and browsing screens, by place: { kind, id }, with a kind from BROWSE_KINDS.
// With the Read filter on, every screen counts and lists only the books it lets through.
function CategoryView({ place, copies: all, ...rest }) {
  const copies = useMemo(() => byRead(all, rest.readFilter), [all, rest.readFilter])
  const props = { copies, ...rest }
  if (place.kind === 'all') return <AllBooks filter={place.id} {...props} />
  if (place.kind === 'category') return <CategoryPage id={place.id} {...props} />
  return <ShelfBooks id={place.id} noSub={place.kind === 'noSub'} {...props} />
}

export default CategoryView
