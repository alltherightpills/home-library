// The places map: a circle for each place books were acquired, sized by how
// many. Pinch or drag to zoom and move; tap a circle for that place's books.
// Loaded only when the map is opened (it brings the map shapes with it).

import { geoCentroid, geoConicEqualArea, geoMercator, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import { placeTitle } from '../acquired.js'
import {
  LOOKUP_GAP_MS,
  MAIN_COUNTRIES,
  countryCode,
  lookupRow,
  lookupUrl,
  mapPlaces,
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
const INSET = 120

const provinces = feature(shapes, shapes.objects.provinces).features
const countries = feature(shapes, shapes.objects.countries).features
const lakes = feature(shapes, shapes.objects.lakes).features
const countryNames = Object.fromEntries(countries.map((c) => [c.properties.name.toLowerCase(), c.properties.code]))
const countryShape = Object.fromEntries(countries.map((c) => [c.properties.code, c]))
// Neighbors shown around the US and Canada (Mexico, the Caribbean, Greenland).
const nearby = countries.filter((c) => {
  if (['USA', 'CAN'].includes(c.properties.code)) return false
  const [lon, lat] = geoCentroid(c)
  return lon > -170 && lon < -10 && lat > 5
})

// Fitted to the lower 48 and southern Canada; pinch out for Alaska and the north.
const projection = geoConicEqualArea()
  .parallels([29.5, 45.5])
  .rotate([96, 0])
  .fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    { type: 'MultiPoint', coordinates: [[-124.5, 25], [-67, 25], [-124.5, 49.5], [-67, 47.5]] },
  )
const drawn = (() => {
  const path = geoPath(projection)
  return {
    countries: nearby.map((f) => path(f)),
    provinces: provinces.map((f) => path(f)),
    lakes: lakes.map((f) => path(f)),
  }
})()

const MAX_ZOOM = 40

// The zoom that shows every circle on the main map (or the whole map if none).
function fitAll(points) {
  if (!points.length) return zoomIdentity
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = 40
  const k = Math.max(1, Math.min(MAX_ZOOM, 8, (W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1)))
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

function Labels({ circles, width, height }) {
  return placeLabels(circles, width, height).map((c) => (
    <text key={c.key} x={c.labelX} y={c.labelY} textAnchor={c.labelAnchor} dominantBaseline="central" className="map-label">
      {c.name}
    </text>
  ))
}

// A small map of one country outside North America, fitted to its places.
function Inset({ code, name, places, most, onOpen }) {
  const shape = countryShape[code]
  const proj = useMemo(() => {
    const p = geoMercator()
    // Fit to the places and a margin around them, so a far-flung territory
    // (or a whole large country) doesn't shrink them to a dot.
    const lons = places.map((x) => x.longitude)
    const lats = places.map((x) => x.latitude)
    const m = 4
    return p.fitExtent(
      [
        [8, 8],
        [INSET - 8, INSET - 8],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [Math.min(...lons) - m, Math.min(...lats) - m],
          [Math.max(...lons) + m, Math.max(...lats) + m],
        ],
      },
    )
  }, [places])
  const path = geoPath(proj)
  const circles = places.map((x) => {
    const [cx, cy] = proj([x.longitude, x.latitude])
    return { ...x, x: cx, y: cy, r: radius(x.count, most) }
  })
  return (
    <figure className="map-inset">
      <svg viewBox={`0 0 ${INSET} ${INSET}`}>
        <rect width={INSET} height={INSET} className="map-water" />
        {countries.map((f) => (
          <path key={f.properties.code} d={path(f) ?? ''} className={f === shape ? 'map-land' : 'map-land other'} />
        ))}
        <Circles circles={circles} onOpen={onOpen} />
        <Labels circles={circles} width={INSET} height={INSET} />
      </svg>
      <figcaption>{name}</figcaption>
    </figure>
  )
}

export default function PlaceMap({ copies, onOpenPlace }) {
  const places = useMemo(() => mapPlaces(copies), [copies])
  const libraryId = copies[0]?.library_id
  const { rows, error, looking } = useCoordinates(places, libraryId)
  const svgRef = useRef(null)
  const zoomRef = useRef(null)
  const [t, setT] = useState(zoomIdentity)

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

  const onMain = located.filter((p) => p.latitude != null && MAIN_COUNTRIES.includes(p.code))
  const insets = useMemo(() => {
    const groups = new Map()
    for (const p of located) {
      if (p.latitude == null || MAIN_COUNTRIES.includes(p.code) || !countryShape[p.code]) continue
      if (!groups.has(p.code)) groups.set(p.code, [])
      groups.get(p.code).push(p)
    }
    return [...groups].map(([code, list]) => ({ code, name: list[0].country, places: list }))
  }, [located])
  const unplaced = located.filter((p) => p.tried && (p.latitude == null || (!MAIN_COUNTRIES.includes(p.code) && !countryShape[p.code])))

  const points = useMemo(() => onMain.map((p) => projection([p.longitude, p.latitude])), [onMain])
  const showAll = () => zoomRef.current && select(svgRef.current).call(zoomRef.current.transform, fitAll(points))

  useEffect(() => {
    const behavior = zoom()
      .scaleExtent([0.4, MAX_ZOOM])
      .on('zoom', (e) => setT(e.transform))
    zoomRef.current = behavior
    const svg = select(svgRef.current)
    svg.call(behavior)
    return () => svg.on('.zoom', null)
  }, [])

  // Start showing every circle once the coordinates are in.
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !rows || !points.length) return
    fitted.current = true
    select(svgRef.current).call(zoomRef.current.transform, fitAll(points))
  }, [rows, points])

  const zoomBy = (factor) => select(svgRef.current).call(zoomRef.current.scaleBy, factor)
  const open = (where) => onOpenPlace('acquiredPlace', undefined, { where })

  const circles = onMain.map((p, i) => {
    const [x, y] = t.apply(points[i])
    return { ...p, x, y, r: radius(p.count, p.most) }
  })

  return (
    <div className="place-map">
      <div className="map-frame">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="map-main">
          <rect width={W} height={H} className="map-water" />
          <g transform={t.toString()}>
            {drawn.countries.map((d, i) => (
              <path key={`c${i}`} d={d ?? ''} className="map-land other" />
            ))}
            {drawn.provinces.map((d, i) => (
              <path key={`p${i}`} d={d ?? ''} className="map-land" />
            ))}
            {drawn.lakes.map((d, i) => (
              <path key={`l${i}`} d={d ?? ''} className="map-lake" />
            ))}
          </g>
          <Circles circles={circles} onOpen={open} />
          <Labels circles={circles} width={W} height={H} />
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

      {!rows && !error && <p className="book-meta">Loading places…</p>}
      {looking > 0 && <p className="book-meta">Finding {looking} {looking === 1 ? 'place' : 'places'} on the map…</p>}
      {error && <p className="error">{error}</p>}

      {insets.length > 0 && (
        <div className="map-insets">
          {insets.map((g) => (
            <Inset key={g.code} code={g.code} name={g.name} places={g.places} most={g.places[0].most} onOpen={open} />
          ))}
        </div>
      )}

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
