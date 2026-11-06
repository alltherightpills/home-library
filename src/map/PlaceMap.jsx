// The places map: a circle for each place books were acquired, sized by how
// many. One continent at a time, with a button for each continent that has
// places. Pinch or drag to zoom and move; tap a circle or name for that place's
// books. Loaded only when the map is opened (it brings the map shapes with it).

import { geoCentroid, geoConicEqualArea, geoMercator, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import { placeTitle } from '../acquired.js'
import {
  LOOKUP_GAP_MS,
  countryCode,
  lookupRow,
  lookupUrl,
  mapPlaces,
  mapRegions,
  needsLookup,
  placeKey,
  placeLabels,
  radius,
} from '../placeMap.js'
import { supabase } from '../supabase.js'
import shapes from './map-shapes.json'

// The map is drawn in a 360 × 300 box, stretched to the screen's width.
const W = 360
const H = 300
const MAX_ZOOM = 40
const MIN_ZOOM = 0.4
// The screen space (in CSS pixels) the zoom buttons cover, so no name hides under them.
const BUTTONS_PX = { width: 190, height: 50 }

const provinces = feature(shapes, shapes.objects.provinces).features
const countries = feature(shapes, shapes.objects.countries).features
const lakes = feature(shapes, shapes.objects.lakes).features
const countryNames = Object.fromEntries(countries.map((c) => [c.properties.name.toLowerCase(), c.properties.code]))
const continents = Object.fromEntries(countries.map((c) => [c.properties.code, c.properties.continent]))
const centroids = new Map(countries.map((c) => [c, geoCentroid(c)]))
const within = ([lon0, lon1], [lat0, lat1]) => (c) => {
  const [lon, lat] = centroids.get(c)
  return lon > lon0 && lon < lon1 && lat > lat0 && lat < lat1
}

const fitTo = (projection, coordinates) =>
  projection.fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    { type: 'MultiPoint', coordinates },
  )

// Each continent's map: how it's flattened, the box it starts on, and what's drawn.
// Other continents (none yet) get a plain map fitted to their places.
const REGIONS = {
  // The lower 48 and southern Canada to start; pinch out for Alaska and the north.
  'North America': () => ({
    projection: fitTo(geoConicEqualArea().parallels([29.5, 45.5]).rotate([96, 0]), [
      [-124.5, 25],
      [-67, 25],
      [-124.5, 49.5],
      [-67, 47.5],
    ]),
    // US states and Canadian provinces, with Mexico, the Caribbean and Greenland around them.
    background: countries.filter((c) => !['USA', 'CAN'].includes(c.properties.code) && within([-170, -10], [5, 90])(c)),
    provinces,
    lakes,
  }),
  // The UK and Ireland to the Baltic and the Mediterranean.
  Europe: () => ({
    projection: fitTo(geoConicEqualArea().parallels([43, 62]).rotate([-10, 0]), [
      [-11, 35],
      [30, 35],
      [-11, 60],
      [30, 60],
    ]),
    background: countries.filter(within([-35, 70], [20, 82])),
    provinces: [],
    lakes: [],
  }),
}

function otherRegion(name, places) {
  const lons = places.map((p) => p.longitude)
  const lats = places.map((p) => p.latitude)
  const m = 12
  return {
    projection: fitTo(geoMercator(), [
      [Math.min(...lons) - m, Math.max(Math.min(...lats) - m, -80)],
      [Math.max(...lons) + m, Math.min(Math.max(...lats) + m, 80)],
    ]),
    background: countries.filter((c) => c.properties.continent === name),
    provinces: [],
    lakes: [],
  }
}

// The default zoom: every circle in view (or the starting view if there are none).
// Zooms out past the starting view only when a place lies outside it (Alaska, say).
function fitAll(points) {
  if (!points.length) return zoomIdentity
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = 40
  // At most 4×, so a lone place (London) still shows the country around it.
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 4, (W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1)))
  return zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k)
}

// Saved coordinates for every place, plus a lookup of any place not tried yet.
function useCoordinates(places, libraryId) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [looking, setLooking] = useState(0)

  useEffect(() => {
    let stopped = false
    supabase
      .from('places')
      .select('country, region, city, latitude, longitude, found_as, source')
      .then(({ data, error: e }) => {
        if (stopped) return
        if (e) setError(`Couldn't load the saved places: ${e.message}`)
        else setRows(data)
      })
    return () => {
      stopped = true
    }
  }, [])

  const missing = useMemo(() => (rows && libraryId ? needsLookup(places, rows) : []), [places, rows, libraryId])
  // When the place search was last asked. Each saved place restarts the loop
  // below (the list changed), so the one-a-second pace is kept here, not per loop.
  const lastAsked = useRef(0)

  useEffect(() => {
    if (!missing.length) return
    let stopped = false
    ;(async () => {
      for (const [i, place] of missing.entries()) {
        if (stopped) return
        setLooking(missing.length - i)
        const wait = lastAsked.current + LOOKUP_GAP_MS - Date.now()
        if (wait > 0) await new Promise((done) => setTimeout(done, wait))
        if (stopped) return
        lastAsked.current = Date.now()
        let answer
        try {
          const response = await fetch(lookupUrl(place), { headers: { Accept: 'application/json' } })
          if (!response.ok) throw new Error(`the place search answered ${response.status}`)
          answer = await response.json()
        } catch (e) {
          // No signal or the search is down: try again next time the map opens.
          if (!stopped) setError(`Couldn't look up places just now (${e.message}). Open the map again later.`)
          break
        }
        const row = lookupRow(place, answer, libraryId)
        const { error: e } = await supabase.from('places').insert(row)
        if (e && e.code !== '23505') {
          if (!stopped) setError(`Couldn't save ${placeTitle(place)}: ${e.message}`)
          break
        }
        if (!stopped) setRows((list) => [...list, row])
      }
      if (!stopped) setLooking(0)
    })()
    return () => {
      stopped = true
    }
  }, [missing, libraryId])

  return { rows, error, looking }
}

function Circles({ circles, onOpen }) {
  // Biggest first, so small circles sit on top and stay tappable.
  return [...circles]
    .sort((a, b) => b.r - a.r)
    .map((c) => (
      <g key={c.key} className="map-place" onClick={() => onOpen(c.place)} role="button" aria-label={`${c.title}: ${c.count}`}>
        <circle cx={c.x} cy={c.y} r={Math.max(c.r, 11)} className="map-hit" />
        <circle cx={c.x} cy={c.y} r={c.r} className="map-circle" />
      </g>
    ))
}

// A place's name opens its books too. The invisible box behind it is a little
// taller than the text, so it's easy to hit with a finger.
const NAME_PAD = 5

function Labels({ circles, width, height, onOpen, avoid }) {
  return placeLabels(circles, width, height, avoid).map((c) => (
    <g key={c.key} className="map-place" onClick={() => onOpen(c.place)} role="button" aria-label={`${c.title}: ${c.count}`}>
      <rect
        x={c.box.x1 - 2}
        y={c.box.y1 - NAME_PAD}
        width={c.box.x2 - c.box.x1 + 4}
        height={c.box.y2 - c.box.y1 + 2 * NAME_PAD}
        className="map-hit"
      />
      <text x={c.labelX} y={c.labelY} textAnchor={c.labelAnchor} dominantBaseline="central" className="map-label">
        {c.name}
      </text>
    </g>
  ))
}

// One continent's map. Shown with a `key` per continent, so switching starts
// fresh: zoomed to fit that continent's places.
function RegionMap({ name, places, onOpen }) {
  const svgRef = useRef(null)
  const zoomRef = useRef(null)
  const [t, setT] = useState(zoomIdentity)
  // Map units per screen pixel (the map is stretched to the screen's width).
  const [unit, setUnit] = useState(1)

  const region = useMemo(() => (REGIONS[name] ? REGIONS[name]() : otherRegion(name, places)), [name, places])
  const drawn = useMemo(() => {
    const path = geoPath(region.projection)
    return {
      background: region.background.map((f) => path(f) ?? ''),
      provinces: region.provinces.map((f) => path(f) ?? ''),
      lakes: region.lakes.map((f) => path(f) ?? ''),
    }
  }, [region])
  const points = useMemo(() => places.map((p) => region.projection([p.longitude, p.latitude])), [places, region])

  useEffect(() => {
    const measure = () => svgRef.current?.clientWidth && setUnit(W / svgRef.current.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    const behavior = zoom()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (e) => setT(e.transform))
    zoomRef.current = behavior
    const svg = select(svgRef.current)
    svg.call(behavior)
    return () => {
      window.removeEventListener('resize', measure)
      svg.on('.zoom', null)
    }
  }, [])

  // Zooming out stops at the starting view (for North America, the lower 48 and
  // southern Canada), or wider only as far as it takes to show every circle.
  useEffect(() => {
    zoomRef.current.scaleExtent([Math.min(1, fitAll(points).k), MAX_ZOOM])
  }, [points])

  // Open on the default zoom, once there are circles (new lookups keep the view).
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !points.length) return
    fitted.current = true
    select(svgRef.current).call(zoomRef.current.transform, fitAll(points))
  }, [points])

  const showAll = () => select(svgRef.current).call(zoomRef.current.transform, fitAll(points))
  const zoomBy = (factor) => select(svgRef.current).call(zoomRef.current.scaleBy, factor)

  const circles = places.map((p, i) => {
    const [x, y] = t.apply(points[i])
    return { ...p, x, y, r: radius(p.count, p.most) }
  })
  const avoid = [{ x1: W - BUTTONS_PX.width * unit, x2: W, y1: 0, y2: BUTTONS_PX.height * unit }]

  return (
    <div className="map-frame">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="map-main">
        <rect width={W} height={H} className="map-water" />
        <g transform={t.toString()}>
          {drawn.background.map((d, i) => (
            <path key={`c${i}`} d={d} className={region.provinces.length ? 'map-land other' : 'map-land'} />
          ))}
          {drawn.provinces.map((d, i) => (
            <path key={`p${i}`} d={d} className="map-land" />
          ))}
          {drawn.lakes.map((d, i) => (
            <path key={`l${i}`} d={d} className="map-lake" />
          ))}
        </g>
        <Circles circles={circles} onOpen={onOpen} />
        <Labels circles={circles} width={W} height={H} onOpen={onOpen} avoid={avoid} />
      </svg>
      <div className="map-buttons">
        <button onClick={() => zoomBy(2)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoomBy(0.5)} aria-label="Zoom out">
          −
        </button>
        <button onClick={showAll}>Show all</button>
      </div>
    </div>
  )
}

// `region` is the continent chosen (kept in the history, so coming back from a
// place's books returns to it); `onRegion` changes it.
export default function PlaceMap({ copies, onOpenPlace, region, onRegion }) {
  const places = useMemo(() => mapPlaces(copies), [copies])
  const libraryId = copies[0]?.library_id
  const { rows, error, looking } = useCoordinates(places, libraryId)

  // Each place with its saved coordinates (or none), title and circle size.
  const located = useMemo(() => {
    const byKey = new Map((rows ?? []).map((r) => [placeKey(r), r]))
    const most = Math.max(1, ...places.map((p) => p.count))
    return places.map((p) => {
      const row = byKey.get(placeKey(p))
      const ok = row && row.latitude != null && row.longitude != null
      return {
        ...p,
        key: placeKey(p),
        place: { country: p.country, region: p.region, city: p.city },
        title: placeTitle({ country: p.country, region: p.region, city: p.city }),
        name: p.city ?? p.region,
        code: countryCode(p.country, countryNames),
        tried: Boolean(row),
        latitude: ok ? row.latitude : null,
        longitude: ok ? row.longitude : null,
        most,
      }
    })
  }, [places, rows])

  const regions = useMemo(() => mapRegions(located, continents), [located])
  const shown = regions.find((r) => r.name === region) ?? regions[0] ?? { name: 'North America', places: [] }
  const unplaced = located.filter((p) => p.tried && (p.latitude == null || !continents[p.code]))
  const open = (where) => onOpenPlace('acquiredPlace', undefined, { where })

  return (
    <div className="place-map">
      {regions.length > 1 && (
        <div className="controls">
          <span className="view-toggle" role="group" aria-label="Continent">
            {regions.map((r) => (
              <button key={r.name} className={r.name === shown.name ? 'chip active' : 'chip'} onClick={() => onRegion(r.name)}>
                {r.name}
              </button>
            ))}
          </span>
        </div>
      )}
      <RegionMap key={shown.name} name={shown.name} places={shown.places} onOpen={open} />

      {!rows && !error && <p className="book-meta">Loading places…</p>}
      {looking > 0 && <p className="book-meta">Finding {looking} {looking === 1 ? 'place' : 'places'} on the map…</p>}
      {error && <p className="error">{error}</p>}

      {unplaced.length > 0 && (
        <>
          <h3 className="section-label">Not on the map</h3>
          <ul className="category-rows">
            {unplaced.map((p) => (
              <li key={p.key}>
                <button onClick={() => open(p.place)}>
                  <span className="category-name">{p.title}</span>
                  <span className="book-meta">{p.count} ›</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="book-meta">The place search couldn't find these. Check the spelling on one of their books; fixing a pin by hand comes with Manage › Places.</p>
        </>
      )}

      <p className="book-meta map-credit">Map shapes: Natural Earth. Places found with OpenStreetMap (© OpenStreetMap contributors).</p>
    </div>
  )
}
