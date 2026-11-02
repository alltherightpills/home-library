import { useMemo } from 'react'
import BookList, { ReadFilter, ViewToggle } from './BookList.jsx'
import { byRead } from './readings.js'
import { labelBooks, labelIndex } from './series.js'

const KIND_NAMES = { series: 'Series', publisherSeries: "Publisher's series" }

const countText = (n) => `${n} ${n === 1 ? 'book' : 'books'}`

// All series or publisher's series, A–Z.
function LabelIndex({ kind, copies, onOpenLabel, onBack }) {
  const entries = useMemo(() => labelIndex(copies, kind), [copies, kind])
  return (
    <div className="series-view">
      <div className="pinned-back">
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
      </div>
      <h2>{KIND_NAMES[kind]}</h2>
      <ul className="label-index">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button onClick={() => onOpenLabel(kind, entry.id)}>
              <span className="book-title">{entry.name}</span>
              <span className="book-meta">{countText(entry.count)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The books in one series, in order; with the Read filter on, only those it lets through.
function LabelBooks({ kind, id, copies, view, setView, readFilter, setReadFilter, onOpenBook, onBack }) {
  const { name, sets: allSets } = useMemo(() => labelBooks(copies, kind, id), [copies, kind, id])
  const total = allSets.reduce((sum, set) => sum + set.books.length, 0)
  const sets = allSets.map((set) => ({ ...set, books: byRead(set.books, readFilter) })).filter((set) => set.books.length)
  const shown = sets.reduce((sum, set) => sum + set.books.length, 0)
  return (
    <div className="series-view">
      <div className="pinned-back">
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
      </div>
      {total === 0 ? (
        <p className="placeholder">No books in this series now.</p>
      ) : (
        <>
          <h2>{name}</h2>
          <div className="controls">
            <span className="book-meta">{readFilter === 'all' ? countText(total) : `${shown} of ${countText(total)} ${readFilter}`}</span>
            <ViewToggle view={view} setView={setView} />
            <ReadFilter filter={readFilter} setFilter={setReadFilter} />
          </div>
          {shown === 0 && <p className="placeholder">None {readFilter} in this series.</p>}
          {sets.map((set) => (
            <section key={set.id}>
              {allSets.length > 1 && <h3>{set.name}</h3>}
              <BookList books={set.books} onOpenBook={onOpenBook} view={view} />
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function SeriesView({ place, copies, view, setView, readFilter, setReadFilter, onOpenLabel, onOpenBook, onBack }) {
  return place.id ? (
    <LabelBooks
      kind={place.kind}
      id={place.id}
      copies={copies}
      view={view}
      setView={setView}
      readFilter={readFilter}
      setReadFilter={setReadFilter}
      onOpenBook={onOpenBook}
      onBack={onBack}
    />
  ) : (
    <LabelIndex kind={place.kind} copies={copies} onOpenLabel={onOpenLabel} onBack={onBack} />
  )
}

export default SeriesView
