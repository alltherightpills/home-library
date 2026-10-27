import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BookDetail from './BookDetail.jsx'
import { coverUrl, normalize } from './useCatalog.js'

const SORTS = {
  author: (a, b) => a.authorSort.localeCompare(b.authorSort) || a.titleSort.localeCompare(b.titleSort),
  title: (a, b) => a.titleSort.localeCompare(b.titleSort) || a.authorSort.localeCompare(b.authorSort),
  added: (a, b) => b.added_on.localeCompare(a.added_on) || a.titleSort.localeCompare(b.titleSort),
}

function Library({ copies, error }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('author')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  // The open book lives in the browser history, so swiping back (or the
  // Back button) returns to the list.
  const [openId, setOpenId] = useState(() => history.state?.book ?? null)
  const listScroll = useRef(0)

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const onPop = (e) => setOpenId(e.state?.book ?? null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Back on the list: return to where it was scrolled before the book opened.
  useLayoutEffect(() => {
    if (openId === null) window.scrollTo(0, listScroll.current)
  }, [openId])

  function openBook(id) {
    listScroll.current = window.scrollY
    history.pushState({ book: id }, '')
    setOpenId(id)
    window.scrollTo(0, 0)
  }

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

  // The list stays on the page (hidden) while a book is open, so nothing
  // has to be rebuilt when coming back.
  return (
    <>
      {open && <BookDetail copy={open} onBack={() => history.back()} />}
      <div className="library" hidden={!!open}>
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
              <option value="title">Title A–Z</option>
              <option value="added">Date cataloged</option>
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
              <button onClick={() => openBook(c.id)}>
                <span className="thumb">
                  {c.cover_id && <img src={coverUrl(c, 'S')} alt="" loading="lazy" />}
                </span>
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
    </>
  )
}

export default Library
