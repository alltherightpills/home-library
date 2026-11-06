// Counting books by when and where they were acquired (from bookplates,
// entered on the shelf walk or Edit a Book).
//
// Places roll up three levels: country › state › city, so "how many from
// Wisconsin?" and "how many from Madison?" both have an answer. Every count is
// worked out fresh from the catalog, so it fills in as the shelf walk goes on.

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
}

// The places (in Library's history) AcquiredView.jsx shows:
//   { kind: 'acquired', id: 'year' | 'place' }   the counts, by year or by place
//   { kind: 'acquiredYear', id: '2009' | 'none' } the books from one year (none = no bookplate)
//   { kind: 'acquiredPlace', where }              the books from one place (where: see booksFrom;
//                                                 null = walked books with no place)
export const ACQUIRED_KINDS = ['acquired', 'acquiredYear', 'acquiredPlace']

const tidy = (value) => (value == null ? null : String(value).trim() || null)

// A state's full name for a US code ("IA" → "Iowa"); anything else as typed.
export function regionName(region, country) {
  const code = region?.toUpperCase()
  return (country === 'USA' || !country) && US_STATES[code] ? US_STATES[code] : region
}

// A copy's place as { country, region, city }, or null if it has none.
export function placeOf(copy) {
  const city = tidy(copy.acquired_city)
  const region = tidy(copy.acquired_region)
  if (!city && !region) return null
  return { country: tidy(copy.acquired_country), region, city }
}

export const yearOf = (copy) => tidy(copy.acquired_year)

// The counts the dashboard and the Acquired screen show.
//   years: [{ year, count }], newest first
//   noYear: walked books with no year (no bookplate)
//   unwalked: books not walked yet
export function yearCounts(copies) {
  const counts = new Map()
  let noYear = 0
  let unwalked = 0
  for (const c of copies) {
    const year = yearOf(c)
    if (year) counts.set(year, (counts.get(year) ?? 0) + 1)
    else if (c.shelf_walked_on) noYear++
    else unwalked++
  }
  const years = [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year.localeCompare(a.year))
  return { years, withYear: copies.length - noYear - unwalked, noYear, unwalked }
}

// Most books first, then A–Z, with blanks last.
const byCount = (a, b) => b.count - a.count || (a.name == null) - (b.name == null) || (a.name ?? '').localeCompare(b.name ?? '')

function group(list, key) {
  const groups = new Map()
  for (const item of list) {
    const k = item[key]
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(item)
  }
  return [...groups].map(([name, items]) => ({ name, count: items.length, items }))
}

// The place outline: [{ name: country, count, regions: [{ name: region, count,
// cities: [{ name: city, count }] }] }], most books first at every level. A
// country whose places have no state (London, UK) has one region named null,
// so its cities sit straight under it. A blank name is a level left empty.
export function placeTree(copies) {
  const places = copies.map(placeOf).filter(Boolean)
  return group(places, 'country')
    .map(({ name, count, items }) => ({
      name,
      count,
      regions: group(items, 'region')
        .map((r) => ({
          name: r.name,
          count: r.count,
          cities: group(r.items, 'city').map(({ name: city, count: n }) => ({ name: city, count: n })).sort(byCount),
        }))
        .sort(byCount),
    }))
    .sort(byCount)
}

// The most-used places, for the dashboard: [{ name: "Madison, WI", count }].
export function topPlaces(copies, limit) {
  const counts = new Map()
  for (const p of copies.map(placeOf).filter(Boolean)) {
    const name = [p.city, p.region].filter(Boolean).join(', ')
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort(byCount).slice(0, limit)
}

// The books one row of the Acquired screen opens. `where` names the levels
// chosen so far: { country } for a country, { country, region } for a state,
// { country, region, city } for a city (a null value matches a blank level).
export function booksFrom(copies, where) {
  return copies.filter((c) => {
    const p = placeOf(c)
    return p && Object.entries(where).every(([level, value]) => p[level] === value)
  })
}

// Walked books with no place on their bookplate.
export const noPlace = (copies) => copies.filter((c) => c.shelf_walked_on && !placeOf(c))

export function booksAcquiredIn(copies, year) {
  if (year === 'none') return copies.filter((c) => !yearOf(c) && c.shelf_walked_on)
  return copies.filter((c) => yearOf(c) === year)
}

// A heading for a place: "Decorah, Iowa", "Wisconsin, USA", "London, UK", "USA".
export function placeTitle({ country, region, city }) {
  const state = region && regionName(region, country)
  if (city !== undefined) return [city ?? 'No city', state, country === 'USA' ? null : country].filter(Boolean).join(', ')
  if (region !== undefined) return [state ?? 'No state', country].filter(Boolean).join(', ')
  return country ?? 'No country'
}
