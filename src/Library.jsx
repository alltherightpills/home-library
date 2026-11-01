import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BookDetail from './BookDetail.jsx'
import BookList from './BookList.jsx'
import SearchBox from './SearchBox.jsx'
import SeriesView from './SeriesView.jsx'
import { labelIndex } from './series.js'
import { searchWords } from './useCatalog.js'

const SORTS = {
  author: (a, b) => a.authorSort.localeCompare(b.authorSort) || a.titleSort.localeCompare(b.titleSort),
  title: (a, b) => a.titleSort.localeCompare(b.titleSort) || a.authorSort.localeCompare(b.authorSort),
  added: (a, b) => b.added_on.localeCompare(a.added_on) || a.titleSort.localeCompare(b.titleSort),
}

function Library({ copies, error, updateCopy, updateWork, removeCopy }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('author')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  // The open book lives in the browser history, so swiping back (or the
  // Back button) returns to the list.
  const [openId, setOpenId] = useState(() => history.state?.book ?? null)
  // A series screen is also a step in the history: { kind } lists them all, and
  // { kind, id } shows the books in one.
  const [place, setPlace] = useState(() => history.state?.place ?? null)
  const listScroll = useRef({})
  const viewName = place ? `${place.kind}:${place.id ?? ''}` : 'all'

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const onPop = (e) => {
      setOpenId(e.state?.book ?? null)
      setPlace(e.state?.place ?? null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Back on a list: return to where it was scrolled before leaving it.
  useLayoutEffect(() => {
    if (openId === null) window.scrollTo(0, listScroll.current[viewName] ?? 0)
  }, [openId, viewName])

  function rememberScroll() {
    if (openId === null) listScroll.current[viewName] = window.scrollY
  }

  function openBook(id) {
    rememberScroll()
    history.pushState({ book: id, place }, '')
    setOpenId(id)
    window.scrollTo(0, 0)
  }

  function openPlace(kind, id) {
    rememberScroll()
    const next = id ? { kind, id } : { kind }
    listScroll.current[`${kind}:${id ?? ''}`] = 0
    history.pushState({ place: next }, '')
    setOpenId(null)
    setPlace(next)
  }

  const flaggedCount = copies?.filter((c) => c.needs_review).length ?? 0
  const seriesCount = useMemo(() => (copies ? labelIndex(copies, 'series').length : 0), [copies])
  const publisherSeriesCount = useMemo(() => (copies ? labelIndex(copies, 'publisherSeries').length : 0), [copies])

  const shown = useMemo(() => {
    if (!copies) return []
    const words = searchWords(query)
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
      {open && (
        <BookDetail
          copy={open}
          onBack={() => history.back()}
          onOpenLabel={openPlace}
          onCoverChange={(changes) => updateCopy(open.id, changes)}
          copies={copies}
          sharedWork={copies.some((c) => c.id !== open.id && c.work?.id === open.work?.id)}
          updateCopy={updateCopy}
          updateWork={updateWork}
          onRemoved={() => {
            removeCopy(open.id)
            history.go(-2) // past the edit screen and the book page, back to the list
          }}
        />
      )}
      {!open && place && (
        <SeriesView
          place={place}
          copies={copies}
          onOpenLabel={openPlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      <div className="library" hidden={!!open || !!place}>
        <p className="total">
          <strong>{copies.length.toLocaleString()}</strong> books
        </p>

        <SearchBox copies={copies} query={query} setQuery={setQuery} onOpenBook={openBook} onOpenLabel={openPlace} />

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
          {seriesCount > 0 && (
            <button className="chip" onClick={() => openPlace('series')}>
              Series ({seriesCount})
            </button>
          )}
          {publisherSeriesCount > 0 && (
            <button className="chip" onClick={() => openPlace('publisherSeries')}>
              Publisher's series ({publisherSeriesCount})
            </button>
          )}
        </div>

        {(query || onlyFlagged) && <p className="diagnostic">{shown.length} matching</p>}

        <BookList books={shown} onOpenBook={openBook} />
      </div>
    </>
  )
}

export default Library
