import { useMemo, useState } from 'react'
import BookDetail from './BookDetail.jsx'
import { normalize } from './useCatalog.js'

const SORTS = {
  author: (a, b) => a.authorSort.localeCompare(b.authorSort) || a.title.localeCompare(b.title),
  added: (a, b) => b.added_on.localeCompare(a.added_on) || a.title.localeCompare(b.title),
}

function Library({ copies, error }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('author')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [openId, setOpenId] = useState(null)

  const flaggedCount = copies?.filter((c) => c.needs_review).length ?? 0

  const shown = useMemo(() => {
    if (!copies) return []
    const words = normalize(query).split(/\s+/).filter(Boolean)
    return copies
      .filter((c) => !onlyFlagged || c.needs_review)
      .filter((c) => words.every((w) => c.searchText.includes(w)))
      .sort(SORTS[sort])
  }, [copies, query, sort, onlyFlagged])

  if (error) return <p className="error">Couldn't load the catalog: {error}</p>
  if (!copies) return <p className="placeholder">Loading your books…</p>

  const open = copies.find((c) => c.id === openId)
  if (open) return <BookDetail copy={open} onBack={() => setOpenId(null)} />

  return (
    <div className="library">
      <p className="total">
        <strong>{copies.length.toLocaleString()}</strong> books
      </p>

      <input
        className="search"
        type="search"
        placeholder="Search title or author"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="controls">
        <label>
          Sort{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="author">Author A–Z</option>
            <option value="added">Date added</option>
          </select>
        </label>
        {flaggedCount > 0 && (
          <button
            className={onlyFlagged ? 'chip active' : 'chip'}
            onClick={() => setOnlyFlagged(!onlyFlagged)}
          >
            Needs checking ({flaggedCount})
          </button>
        )}
      </div>

      {(query || onlyFlagged) && <p className="diagnostic">{shown.length} matching</p>}

      <ul className="book-list">
        {shown.map((c) => (
          <li key={c.id}>
            <button onClick={() => setOpenId(c.id)}>
              <span className="book-title">
                {c.needs_review && <span className="flag">⚠︎ </span>}
                {c.title}
              </span>
              <span className="book-meta">
                {c.byline}
                {c.edition_year ? ` · ${c.edition_year}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Library
