import { useMemo } from 'react'
import BookList, { ViewToggle } from './BookList.jsx'
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

// The books in one series, in order.
function LabelBooks({ kind, id, copies, view, setView, onOpenBook, onBack }) {
  const { name, sets } = useMemo(() => labelBooks(copies, kind, id), [copies, kind, id])
  const total = sets.reduce((sum, set) => sum + set.books.length, 0)
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
            <span className="book-meta">{countText(total)}</span>
            <ViewToggle view={view} setView={setView} />
          </div>
          {sets.map((set) => (
            <section key={set.id}>
              {sets.length > 1 && <h3>{set.name}</h3>}
              <BookList books={set.books} onOpenBook={onOpenBook} view={view} />
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function SeriesView({ place, copies, view, setView, onOpenLabel, onOpenBook, onBack }) {
  return place.id ? (
    <LabelBooks kind={place.kind} id={place.id} copies={copies} view={view} setView={setView} onOpenBook={onOpenBook} onBack={onBack} />
  ) : (
    <LabelIndex kind={place.kind} copies={copies} onOpenLabel={onOpenLabel} onBack={onBack} />
  )
}

export default SeriesView
