// The rules behind Manage › Places: every place books were acquired, with
// their books, and what renaming one would do. No database access here, so
// tests can check them.
//
// A book's place is its city, state and country text (trimmed), matched
// exactly, so "Decorah, IA" and "Decorah, IA, USA" are two places until one is
// renamed to the other, which merges them.

import { placeOf } from './acquired.js'
import { placeKey } from './placeMap.js'

// The place exactly as stored, so spellings that Acquired shows alike (it
// leaves out "USA") can be told apart: "Decorah, IA, USA" and "Decorah, IA".
export const exactText = ({ city, region, country }) => [city, region, country].filter(Boolean).join(', ')

// Every place on a book: [{ place, key, books }], A to Z by the exact text, so
// near spellings sit next to each other.
export function placesIn(copies) {
  const byKey = new Map()
  for (const copy of copies) {
    const place = placeOf(copy)
    if (!place) continue
    const key = placeKey(place)
    if (!byKey.has(key)) byKey.set(key, { place, key, books: [] })
    byKey.get(key).books.push(copy)
  }
  return [...byKey.values()].sort((a, b) =>
    exactText(a.place).localeCompare(exactText(b.place), undefined, { sensitivity: 'base' }),
  )
}

const tidy = (text) => text.replace(/\s+/g, ' ').trim() || null

// What renaming `from` to the typed { city, region, country } would do:
// { to, problem, unchanged, joins }. `joins` is the other place that already
// has that exact text, which the rename merges into.
export function renamePlacePlan(places, from, form) {
  const to = { city: tidy(form.city), region: tidy(form.region), country: tidy(form.country) }
  if (!to.city && !to.region) return { to, problem: 'A place needs a city or a state.' }
  const key = placeKey(to)
  if (key === placeKey(from)) return { to, unchanged: true }
  return { to, joins: places.find((p) => p.key === key) ?? null }
}
