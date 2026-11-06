// The rules behind the places map (src/map/PlaceMap.jsx): which places go
// where, how big their circles are, which names fit, and how a place's
// coordinates are looked up. Kept apart from the drawing so tests can check them.

import { placeOf, regionName } from './acquired.js'

// The map shows one continent at a time, with a button for each continent that
// has places; North America first (US states and Canadian provinces drawn).
export const REGION_ORDER = ['North America', 'Europe', 'Asia', 'South America', 'Africa', 'Oceania']

// Places grouped by continent, for the region buttons: [{ name, places }], in
// REGION_ORDER (any other continent last). Places with no coordinates or no
// known country are left out (they're listed under the map instead).
// `continents` maps a country code to its continent, from the map shapes.
export function mapRegions(places, continents) {
  const groups = new Map()
  for (const p of places) {
    const continent = continents[p.code]
    if (p.latitude == null || !continent) continue
    if (!groups.has(continent)) groups.set(continent, [])
    groups.get(continent).push(p)
  }
  const rank = (name) => (REGION_ORDER.includes(name) ? REGION_ORDER.indexOf(name) : REGION_ORDER.length)
  return [...groups].map(([name, list]) => ({ name, places: list })).sort((a, b) => rank(a.name) - rank(b.name))
}

// Names the owner may type for a country → the map's three-letter code.
// Anything else is matched against the map's own country names.
const COUNTRY_ALIASES = {
  usa: 'USA', us: 'USA', 'u.s.': 'USA', 'u.s.a.': 'USA', 'united states': 'USA', 'united states of america': 'USA', america: 'USA',
  canada: 'CAN', mexico: 'MEX', méxico: 'MEX',
  uk: 'GBR', 'u.k.': 'GBR', 'united kingdom': 'GBR', 'great britain': 'GBR', britain: 'GBR', england: 'GBR', scotland: 'GBR', wales: 'GBR', 'northern ireland': 'GBR',
  ireland: 'IRL', germany: 'DEU', france: 'FRA', italy: 'ITA', spain: 'ESP', netherlands: 'NLD', holland: 'NLD', japan: 'JPN',
}

// `names` maps lower-case country names from the map shapes to their codes.
// A place with no country is taken as USA, like the shelf walk's default.
export function countryCode(country, names = {}) {
  if (!country) return 'USA'
  const key = country.trim().toLowerCase()
  return COUNTRY_ALIASES[key] ?? names[key] ?? (/^[A-Z]{3}$/.test(country.trim()) ? country.trim() : null)
}

// The text that names one place, for matching books to saved coordinates.
export const placeKey = ({ country, region, city }) => JSON.stringify([country ?? null, region ?? null, city ?? null])

// Every place the books name, with how many books: [{ country, region, city, count }],
// most books first.
export function mapPlaces(copies) {
  const counts = new Map()
  for (const p of copies.map(placeOf).filter(Boolean)) {
    const key = placeKey(p)
    if (!counts.has(key)) counts.set(key, { ...p, count: 0 })
    counts.get(key).count++
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

// Places with no saved row yet (found or not found): the ones to look up.
export function needsLookup(places, rows) {
  const saved = new Set(rows.map(placeKey))
  return places.filter((p) => !saved.has(placeKey(p)))
}

// OpenStreetMap's place search (Nominatim), asked with the parts kept apart so
// "Springfield" in Illinois isn't confused with one elsewhere. Their rules:
// at most one request a second, and save the answers rather than asking again.
export const LOOKUP_GAP_MS = 1100

export function lookupUrl({ country, region, city }) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1' })
  if (city) params.set('city', city)
  if (region) params.set('state', regionName(region, country ?? 'USA'))
  params.set('country', country ?? 'USA')
  return `https://nominatim.openstreetmap.org/search?${params}`
}

// The row to save from the search's answer; blank coordinates if nothing was found.
export function lookupRow(place, answer, libraryId) {
  const hit = Array.isArray(answer) ? answer[0] : null
  const latitude = hit ? Number(hit.lat) : null
  const longitude = hit ? Number(hit.lon) : null
  const found = Number.isFinite(latitude) && Number.isFinite(longitude)
  return {
    library_id: libraryId,
    country: place.country ?? null,
    region: place.region ?? null,
    city: place.city ?? null,
    latitude: found ? latitude : null,
    longitude: found ? longitude : null,
    source: 'lookup',
    found_as: found ? (hit.display_name ?? null) : null,
    looked_up_at: new Date().toISOString(),
  }
}

// A circle's radius on screen. Its area (not its width) follows the count, so
// three times the books looks three times as big. Never too small to tap.
export const MIN_RADIUS = 4
export const MAX_RADIUS = 24

export function radius(count, most) {
  return Math.max(MIN_RADIUS, MAX_RADIUS * Math.sqrt(count / Math.max(most, 1)))
}

// Which circles get a name beside them: biggest first, each name only if it
// fits without covering another name or circle. `circles`: [{ x, y, r, name }].
// Returns [{ ...circle, labelX, labelY, labelAnchor, box }] for the ones that
// fit; `box` ({ x1, x2, y1, y2 }) is the space the name takes, for tapping it.
const CHAR_WIDTH = 6.2
const LABEL_HEIGHT = 13

// `avoid`: boxes no name may cover (the zoom buttons, the insets).
export function placeLabels(circles, width, height, avoid = []) {
  const overlaps = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
  const discs = circles.map((c) => ({ x1: c.x - c.r, x2: c.x + c.r, y1: c.y - c.r, y2: c.y + c.r }))
  const placed = []
  const boxes = [...avoid]
  for (const c of [...circles].sort((a, b) => b.r - a.r)) {
    // A place off the visible map (zoomed past it) gets no name, so names
    // never get slid in from the edge for places you can't see.
    if (!c.name || c.x < 0 || c.x > width || c.y < 0 || c.y > height) continue
    const w = c.name.length * CHAR_WIDTH
    const h = LABEL_HEIGHT
    // Above or below, centered on the circle but slid sideways to stay on the map.
    const centered = Math.min(Math.max(c.x - w / 2, 1), width - 1 - w)
    // Right of the circle, then left, then above, then below.
    const spots = [
      { x1: c.x + c.r + 3, y1: c.y - h / 2 },
      { x1: c.x - c.r - 3 - w, y1: c.y - h / 2 },
      { x1: centered, y1: c.y - c.r - 2 - h },
      { x1: centered, y1: c.y + c.r + 2 },
    ]
    for (const [i, { x1, y1 }] of spots.entries()) {
      const box = { x1, x2: x1 + w, y1, y2: y1 + h }
      if (box.x1 < 0 || box.x2 > width || box.y1 < 0 || box.y2 > height) continue
      if (boxes.some((b) => overlaps(b, box))) continue
      if (discs.some((d, j) => circles[j] !== c && overlaps(d, box))) continue
      boxes.push(box)
      const left = i === 1
      placed.push({ ...c, labelX: left ? box.x2 : box.x1, labelAnchor: left ? 'end' : 'start', labelY: y1 + h / 2, box })
      break
    }
  }
  return placed
}
