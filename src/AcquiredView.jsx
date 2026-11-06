import { Suspense, lazy, useMemo } from 'react'
import BookList, { ReadFilter, SortSelect, ViewToggle } from './BookList.jsx'
import { BackBar, Row } from './CategoryView.jsx'
import { booksAcquiredIn, booksFrom, noPlace, placeOf, placeTitle, placeTree, regionName, topPlaces, yearCounts } from './acquired.js'
import { byRead, countText } from './readings.js'
import { SORTS } from './useCatalog.js'

// The map brings its own shapes and drawing code, so it loads only when opened.
const PlaceMap = lazy(() => import('./map/PlaceMap.jsx'))

// The dashboard's panel: the top years and places, and what's still blank.
export function AcquiredPanel({ copies, onOpenPlace }) {
  const { years, withYear, noYear, unwalked } = useMemo(() => yearCounts(copies), [copies])
  const places = useMemo(() => topPlaces(copies, 3), [copies])
  const placeCount = useMemo(() => copies.filter(placeOf).length, [copies])
  const top = (list, name) => list.map((x) => `${x[name]}: ${x.count}`).join(' · ')
  const topYears = [...years].sort((a, b) => b.count - a.count || b.year.localeCompare(a.year)).slice(0, 3)
  return (
    <>
      <h3 className="section-label">Acquired</h3>
      {withYear || placeCount ? (
        <ul className="category-rows">
          <Row
            name="By year"
            detail={top(topYears, 'year')}
            count={`${withYear.toLocaleString()} books`}
            onOpen={() => onOpenPlace('acquired', 'year')}
          />
          <Row
            name="By place"
            detail={top(places, 'name')}
            count={`${placeCount.toLocaleString()} books`}
            onOpen={() => onOpenPlace('acquired', 'place')}
          />
        </ul>
      ) : null}
      <p className="book-meta">
        {withYear || placeCount ? '' : 'Nothing yet: the shelf walk fills this in. '}
        {noYear > 0 && `${noYear.toLocaleString()} walked with no bookplate · `}
        {unwalked.toLocaleString()} not walked yet
      </p>
    </>
  )
}

function ByYear({ copies, onOpenPlace }) {
  const { years, noYear, unwalked } = useMemo(() => yearCounts(copies), [copies])
  return (
    <ul className="category-rows">
      {years.map(({ year, count }) => (
        <Row key={year} name={year} count={count} onOpen={() => onOpenPlace('acquiredYear', year)} />
      ))}
      {noYear > 0 && <Row name="No bookplate (walked)" count={noYear} muted onOpen={() => onOpenPlace('acquiredYear', 'none')} />}
      {unwalked > 0 && <Row name="Not walked yet" count={unwalked} muted onOpen={() => onOpenPlace('all', 'unwalked')} />}
    </ul>
  )
}

// Country › state › city, as an outline. A country with no states (London, UK)
// lists its cities straight under it.
function ByPlace({ copies, onOpenPlace }) {
  const tree = useMemo(() => placeTree(copies), [copies])
  const missing = useMemo(() => noPlace(copies).length, [copies])
  const unwalked = copies.filter((c) => !c.shelf_walked_on).length
  const open = (where) => onOpenPlace('acquiredPlace', undefined, { where })
  return (
    <ul className="category-rows">
      {tree.flatMap((country) => [
        <Row key={`c:${country.name}`} name={country.name ?? 'No country'} count={country.count} onOpen={() => open({ country: country.name })} />,
        ...country.regions.flatMap((region) => {
          const stateless = region.name === null
          const cities = region.cities.map((city) => (
            <Row
              key={`t:${country.name}:${region.name}:${city.name}`}
              name={city.name ?? 'No city'}
              muted={city.name === null}
              indent={stateless ? 1 : 2}
              count={city.count}
              onOpen={() => open({ country: country.name, region: region.name, city: city.name })}
            />
          ))
          if (stateless) return cities
          return [
            <Row
              key={`r:${country.name}:${region.name}`}
              name={regionName(region.name, country.name)}
              indent={1}
              count={region.count}
              onOpen={() => open({ country: country.name, region: region.name })}
            />,
            ...cities,
          ]
        }),
      ])}
      {missing > 0 && <Row name="No place (walked)" count={missing} muted onOpen={() => open(null)} />}
      {unwalked > 0 && <Row name="Not walked yet" count={unwalked} muted onOpen={() => onOpenPlace('all', 'unwalked')} />}
    </ul>
  )
}

// The Acquired screen: every year, or every place, with how many books.
function AcquiredCounts({ by, map, region, copies, readFilter, setReadFilter, onOpenPlace, onReplacePlace, onBack }) {
  const withYear = copies.filter((c) => c.acquired_year).length
  const withPlace = copies.filter(placeOf).length
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="My Library" />
      <h2>Acquired</h2>
      <p className="book-meta">
        {by === 'place' ? countText(withPlace, readFilter) : countText(withYear, readFilter)} with{' '}
        {by === 'place' ? 'a place' : 'a year'}, of {copies.length.toLocaleString()}
      </p>
      <div className="controls">
        {['year', 'place'].map((b) => (
          <button key={b} className={by === b ? 'chip active' : 'chip'} onClick={() => onReplacePlace({ kind: 'acquired', id: b })}>
            By {b}
          </button>
        ))}
        <ReadFilter filter={readFilter} setFilter={setReadFilter} />
      </div>
      {by === 'place' && (
        <div className="controls">
          {[false, true].map((m) => (
            <button
              key={String(m)}
              className={map === m ? 'chip active' : 'chip'}
              onClick={() => onReplacePlace({ kind: 'acquired', id: 'place', ...(m && { map: true }) })}
            >
              {m ? 'Map' : 'List'}
            </button>
          ))}
        </div>
      )}
      {by !== 'place' ? (
        <ByYear copies={copies} onOpenPlace={onOpenPlace} />
      ) : map ? (
        <Suspense fallback={<p className="book-meta">Loading the map…</p>}>
          <PlaceMap
            copies={copies}
            onOpenPlace={onOpenPlace}
            region={region}
            onRegion={(r) => onReplacePlace({ kind: 'acquired', id: 'place', map: true, region: r })}
          />
        </Suspense>
      ) : (
        <ByPlace copies={copies} onOpenPlace={onOpenPlace} />
      )}
    </div>
  )
}

// The books from one year or one place, like a category's list.
function AcquiredBooks({ title, books, sort, setSort, view, setView, readFilter, setReadFilter, onOpenBook, onBack }) {
  const sorted = useMemo(() => [...books].sort(SORTS[sort]), [books, sort])
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Acquired" />
      <h2>{title}</h2>
      <p className="book-meta">{countText(books.length, readFilter)}</p>
      <div className="controls">
        <SortSelect sort={sort} setSort={setSort} />
        <ViewToggle view={view} setView={setView} />
        <ReadFilter filter={readFilter} setFilter={setReadFilter} />
      </div>
      <BookList books={sorted} onOpenBook={onOpenBook} view={view} />
    </div>
  )
}

// With the Read filter on, every screen here counts and lists only the books it lets through.
function AcquiredView({ place, copies: all, ...rest }) {
  const copies = useMemo(() => byRead(all, rest.readFilter), [all, rest.readFilter])
  const books = useMemo(() => {
    if (place.kind === 'acquiredYear') return booksAcquiredIn(copies, place.id)
    if (place.kind === 'acquiredPlace') return place.where ? booksFrom(copies, place.where) : noPlace(copies)
    return null
  }, [copies, place])

  if (place.kind === 'acquired') return <AcquiredCounts by={place.id ?? 'year'} map={!!place.map} region={place.region} copies={copies} {...rest} />
  const title =
    place.kind === 'acquiredYear'
      ? place.id === 'none'
        ? 'No bookplate'
        : `Acquired in ${place.id}`
      : place.where
        ? placeTitle(place.where)
        : 'No place'
  return <AcquiredBooks title={title} books={books} {...rest} />
}

export default AcquiredView
