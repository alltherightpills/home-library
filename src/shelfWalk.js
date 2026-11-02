import { supabase } from './supabase.js'
import { SORTS, normalize, searchWords } from './useCatalog.js'

// The shelf walk: one book at a time, the bookplate's year and place (city,
// state) and whether you've read it. Country is kept too, USA unless changed.

export const DEFAULT_COUNTRY = 'USA'

const today = () => new Date().toLocaleDateString('en-CA')

// Find by title: copies whose title (or original title, before the title
// cleanup) has every word typed, A–Z, at most `limit`.
export function titleMatches(copies, text, limit = 30) {
  const words = searchWords(text)
  if (!words.length) return []
  return copies
    .filter((c) => {
      const title = normalize(`${c.title} ${c.original_title ?? ''}`)
      return words.every((w) => title.includes(w))
    })
    .sort(SORTS.title)
    .slice(0, limit)
}

// "Decorah, IA" from a copy's city and state (the country is its own field).
export const placeText = (copy) => [copy.acquired_city, copy.acquired_region].filter(Boolean).join(', ')

// "Decorah, IA" → { city: 'Decorah', region: 'IA' }. The last comma splits them,
// so "St. Paul, MN" works; with no comma it's all city.
export function parsePlace(text) {
  const tidy = text.trim().replace(/\s+/g, ' ').replace(/,$/, '')
  const cut = tidy.lastIndexOf(',')
  if (cut === -1) return { city: tidy || null, region: null }
  return { city: tidy.slice(0, cut).trim() || null, region: tidy.slice(cut + 1).trim() || null }
}

// Values used so far, most used first (ties: the later year, or A–Z).
function byUse(values, compare) {
  const counts = new Map()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || compare(a, b))
}

// The suggestions under the year and place boxes, and in their typing lists.
export function walkSuggestions(copies) {
  return {
    years: byUse(copies.map((c) => c.acquired_year && String(c.acquired_year)), (a, b) => b.localeCompare(a)),
    places: byUse(copies.map(placeText), (a, b) => a.localeCompare(b)),
    countries: byUse([DEFAULT_COUNTRY, ...copies.map((c) => c.acquired_country)], (a, b) => a.localeCompare(b)),
  }
}

// The card's starting values: the book's own, if it has any. A walked book
// with no place keeps the country blank only if it was saved that way.
export function startForm(copy) {
  return {
    year: copy.acquired_year ? String(copy.acquired_year) : '',
    place: placeText(copy),
    country: copy.acquired_country ?? DEFAULT_COUNTRY,
    read: null, // 'yes' or 'no', once answered
  }
}

export function checkForm(form, askRead) {
  const year = form.year.trim()
  if (year && (!/^\d{4}$/.test(year) || Number(year) > new Date().getFullYear())) {
    return 'Year acquired should be a four-digit year, not in the future.'
  }
  if (askRead && !form.read) return 'Answer Read: yes or no.'
  return ''
}

// The copy's changes: year, place, and today's walk date. With no place the
// country is left blank too, so a book with no bookplate gets nothing.
export function walkChanges(form) {
  const { city, region } = parsePlace(form.place)
  const year = form.year.trim()
  return {
    acquired_year: year ? Number(year) : null,
    acquired_city: city,
    acquired_region: region,
    acquired_country: city || region ? form.country.trim() || null : null,
    shelf_walked_on: today(),
  }
}

// Saves the card: the copy first, then a past read if you said yes.
// Returns the copy's changes, to show without reloading the catalog.
export async function saveWalk(copy, form, readings) {
  const changes = walkChanges(form)
  const { error } = await supabase.from('copies').update(changes).eq('id', copy.id)
  if (error) throw new Error(`Saving: ${error.message}`)
  if (form.read === 'yes' && !copy.read) {
    try {
      await readings.markRead(copy)
    } catch (e) {
      e.saved = changes // the year and place were saved; only the read wasn't
      throw e
    }
  }
  return changes
}
