import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AcquiredView, { AcquiredPanel } from './AcquiredView.jsx'
import { ACQUIRED_KINDS } from './acquired.js'
import BookDetail from './BookDetail.jsx'
import BookList, { ReadFilter, SortSelect, ViewToggle } from './BookList.jsx'
import CategoryReview from './CategoryReview.jsx'
import CategoryView, { CategoryRows } from './CategoryView.jsx'
import Manage from './Manage.jsx'
import { AuthorsList, DuplicatesList, MergePick, MergeScreen, PersonPage } from './ManageAuthors.jsx'
import { PlacePage, PlacesList } from './ManagePlaces.jsx'
import { BROWSE_KINDS } from './categories/browse.js'
import { byRead, readCopyIds } from './readings.js'
import SeriesView from './SeriesView.jsx'
import ShelfWalk from './ShelfWalk.jsx'
import { labelIndex } from './series.js'
import { SORTS, searchWords } from './useCatalog.js'

const VIEW_KEY = 'library.view'

// The search bar itself belongs to App.jsx, which shows it on other tabs too;
// `query` is what's typed in it, and `nav` hands it this tab's moves.
function Library({ copies: catalog, categories, readings, loans, error, updateCopy, updateWork, updateAuthor, mergeAuthors, updateCopies, removeCopy, addCopy, query, nav }) {
  // Every copy marked `read` (yours, or another copy of the same work), for
  // the ✓, the count and the Read filter.
  const copies = useMemo(() => {
    if (!catalog) return catalog
    const read = readCopyIds(readings.list, catalog)
    return catalog.map((c) => ({ ...c, read: read.has(c.id) }))
  }, [catalog, readings.list])
  const readCount = useMemo(() => copies?.filter((c) => c.read).length ?? 0, [copies])
  const [sort, setSort] = useState('author')
  // All / Unread / Read, offered once the reading history has loaded.
  const [readFilterChoice, setReadFilter] = useState('all')
  const readFilter = readings.list ? readFilterChoice : 'all'
  const filterProps = { readFilter, setReadFilter: readings.list ? setReadFilter : null }
  // List or Gallery, for every list of books, remembered on the phone.
  const [view, setViewState] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'list')
  const setView = (v) => {
    localStorage.setItem(VIEW_KEY, v)
    setViewState(v)
  }
  // The open book lives in the browser history, so swiping back (or the
  // Back button) returns to the list.
  const [openId, setOpenId] = useState(() => history.state?.book ?? null)
  // Series, category and review screens are also steps in the history: for
  // series, { kind } lists them all and { kind, id } shows the books in one;
  // the category screens are listed in CategoryView.jsx.
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

  // `extra` is anything more the screen needs, such as Review categories' filter.
  function openPlace(kind, id, extra) {
    rememberScroll()
    const next = { kind, ...(id && { id }), ...extra }
    listScroll.current[`${kind}:${id ?? ''}`] = 0
    history.pushState({ place: next }, '')
    setOpenId(null)
    setPlace(next)
  }

  // Typing a search on another screen shows the results on the main screen,
  // as a step to swipe back from.
  function showResults() {
    if (openId === null && place === null) return
    rememberScroll()
    history.pushState({}, '')
    setOpenId(null)
    setPlace(null)
    window.scrollTo(0, 0)
  }

  useImperativeHandle(nav, () => ({ openBook, openPlace, showResults }))

  // Moves on without leaving a step to swipe back to.
  function replacePlace(next) {
    history.replaceState({ place: next }, '')
    setPlace(next)
  }

  const reviewCount = copies?.filter((c) => c.category_review).length ?? 0
  const walkedCount = copies?.filter((c) => c.shelf_walked_on).length ?? 0
  const seriesCount = useMemo(() => (copies ? labelIndex(copies, 'series').length : 0), [copies])
  const publisherSeriesCount = useMemo(() => (copies ? labelIndex(copies, 'publisherSeries').length : 0), [copies])

  const shown = useMemo(() => {
    if (!copies) return []
    const words = searchWords(query)
    if (!words.length) return []
    return byRead(copies, readFilter)
      .filter((c) => words.every((w) => c.searchText.includes(w)))
      .sort(SORTS[sort])
  }, [copies, query, sort, readFilter])

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
          onOpenBook={openBook}
          onOpenLabel={openPlace}
          onCoverChange={(changes) => updateCopy(open.id, changes)}
          copies={copies}
          categories={categories}
          readings={readings}
          loans={loans}
          sharedWork={copies.some((c) => c.id !== open.id && c.work?.id === open.work?.id)}
          updateCopy={updateCopy}
          updateWork={updateWork}
          onRemoved={() => {
            removeCopy(open.id)
            readings.reload() // the database moved the book's title onto its readings
            history.go(-2) // past the edit screen and the book page, back to the list
          }}
        />
      )}
      {place?.kind === 'review' && (
        <div className="review-place" hidden={!!open}>
          <CategoryReview
            place={place}
            copies={copies}
            categories={categories}
            onOpenPlace={openPlace}
            onReplacePlace={replacePlace}
            onOpenBook={openBook}
            onBack={() => history.back()}
            updateCopy={updateCopy}
          />
        </div>
      )}
      {!open && place && BROWSE_KINDS.includes(place.kind) && (
        <CategoryView
          place={place}
          copies={copies}
          categories={categories}
          sort={sort}
          setSort={setSort}
          view={view}
          setView={setView}
          {...filterProps}
          onOpenPlace={openPlace}
          onReplacePlace={replacePlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      {!open && place && ACQUIRED_KINDS.includes(place.kind) && (
        <AcquiredView
          place={place}
          copies={copies}
          sort={sort}
          setSort={setSort}
          view={view}
          setView={setView}
          {...filterProps}
          onOpenPlace={openPlace}
          onReplacePlace={replacePlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      {!open && place && ['series', 'publisherSeries'].includes(place.kind) && (
        <SeriesView
          place={place}
          copies={copies}
          view={view}
          setView={setView}
          {...filterProps}
          onOpenLabel={openPlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      {!open && place?.kind === 'manage' && <Manage copies={copies} onOpenPlace={openPlace} onBack={() => history.back()} />}
      {!open && place?.kind === 'authors' && (
        <AuthorsList place={place} copies={copies} onOpenPlace={openPlace} onReplacePlace={replacePlace} onBack={() => history.back()} />
      )}
      {!open && place?.kind === 'places' && <PlacesList copies={copies} onOpenPlace={openPlace} onBack={() => history.back()} />}
      {!open && place?.kind === 'placeEdit' && (
        // Keyed by the place, so a rename shows the renamed place fresh.
        <PlacePage
          key={place.id}
          place={place}
          copies={copies}
          updateCopies={updateCopies}
          onReplacePlace={replacePlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      {!open && place?.kind === 'author' && (
        <PersonPage
          place={place}
          copies={copies}
          updateAuthor={updateAuthor}
          onOpenPlace={openPlace}
          onOpenBook={openBook}
          onBack={() => history.back()}
        />
      )}
      {!open && place?.kind === 'duplicates' && <DuplicatesList copies={copies} onOpenPlace={openPlace} onBack={() => history.back()} />}
      {!open && place?.kind === 'mergePick' && (
        <MergePick place={place} copies={copies} onReplacePlace={replacePlace} onBack={() => history.back()} />
      )}
      {!open && place?.kind === 'merge' && (
        // Keyed by the group, so a different group starts with fresh choices.
        <MergeScreen key={place.ids.join()} place={place} copies={copies} mergeAuthors={mergeAuthors} onBack={() => history.back()} />
      )}
      {!open && place?.kind === 'walk' && (
        <ShelfWalk
          copies={copies}
          categories={categories}
          readings={readings}
          updateCopy={updateCopy}
          addCopy={addCopy}
          onOpenPlace={openPlace}
          onBack={() => history.back()}
        />
      )}
      <div className="library" hidden={!!open || !!place}>
        <p className="total">
          <span>
          <strong>{copies.length.toLocaleString()}</strong> books
          {readings.list && (
            <>
              {' · '}
              {readCount > 0 ? (
                // Opens All books showing only the read ones.
                <button
                  className="link"
                  onClick={() => {
                    setReadFilter('read')
                    openPlace('all')
                  }}
                >
                  {readCount.toLocaleString()} read
                </button>
              ) : (
                'none read yet'
              )}
            </>
          )}
          </span>
          <button className="manage-button" onClick={() => openPlace('manage')} aria-label="Manage">
            {/* Three sliders: the usual sign for settings and tools. */}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
            Manage
          </button>
        </p>

        {query.trim() ? (
          <>
            <div className="controls">
              <SortSelect sort={sort} setSort={setSort} />
              <ViewToggle view={view} setView={setView} />
              <ReadFilter filter={readFilter} setFilter={filterProps.setReadFilter} />
            </div>
            <p className="diagnostic">
              {shown.length} matching{readFilter !== 'all' && ` (${readFilter} only)`}
            </p>
            <BookList books={shown} onOpenBook={openBook} view={view} letters={sort} />
          </>
        ) : (
          <>
            {reviewCount > 0 && (
              <button className="review-banner" onClick={() => openPlace('review')}>
                <strong>{reviewCount} {reviewCount === 1 ? 'book needs' : 'books need'}</strong> a category check ›
              </button>
            )}
            <h3 className="section-label">Categories</h3>
            <CategoryRows copies={copies} categories={categories} onOpenPlace={openPlace} />
            <button className="primary browse-all" onClick={() => openPlace('all')}>
              Browse all {copies.length.toLocaleString()} books ›
            </button>
            <button className="review-banner walk-banner" onClick={() => openPlace('walk')}>
              <strong>Shelf walk</strong> · {walkedCount.toLocaleString()} of {copies.length.toLocaleString()} walked ›
            </button>
            <div className="controls">
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
            <AcquiredPanel copies={copies} onOpenPlace={openPlace} />
          </>
        )}
      </div>
    </>
  )
}

export default Library
