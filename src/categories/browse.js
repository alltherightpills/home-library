// Browsing by category: which books are on a shelf, and how many.
//
// A main category counts only the books whose main shelf it is, so the counts
// add up to the whole library (as reports will). Books "also in" it are shown
// when browsing it, marked as such. A subcategory has every book on it, from
// the main shelf or an "also in".

import { activeShelves, otherMainIds } from './review.js'

// The places (in Library's history) that CategoryView.jsx shows.
export const BROWSE_KINDS = ['category', 'shelf', 'noSub', 'all']

const mainOf = (copy) => activeShelves(copy).find((s) => s.is_main)?.category_id ?? null

// The books on one category's shelf: [{ copy, alsoIn }], where alsoIn means the
// book's main shelf is elsewhere. `noSub` keeps only main-shelf books with none
// of this main category's subcategories.
export function booksOn(copies, categories, id, { noSub = false } = {}) {
  const category = categories.find((c) => c.id === id)
  if (!category) return []
  const byId = new Map(categories.map((c) => [c.id, c]))
  const books = []
  for (const copy of copies) {
    const main = mainOf(copy)
    if (category.parent_id) {
      if (activeShelves(copy).some((s) => s.category_id === id)) books.push({ copy, alsoIn: main !== category.parent_id })
    } else if (main === id) {
      if (noSub && activeShelves(copy).some((s) => byId.get(s.category_id)?.parent_id === id)) continue
      books.push({ copy, alsoIn: false })
    } else if (!noSub && otherMainIds(copy, categories).has(id)) {
      books.push({ copy, alsoIn: true })
    }
  }
  return books
}

// Counts for the dashboard and a category's page, in one pass over the library:
// { main: Map(id → main-shelf books), also: Map(id → also-in books),
//   sub: Map(id → books on the subcategory), noSub: Map(main id → main-shelf
//   books with no subcategory of it), noMain }
export function shelfCounts(copies, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const bump = (map, id) => map.set(id, (map.get(id) ?? 0) + 1)
  const counts = { main: new Map(), also: new Map(), sub: new Map(), noSub: new Map(), noMain: 0 }
  for (const copy of copies) {
    const main = mainOf(copy)
    if (main) bump(counts.main, main)
    else counts.noMain++
    const subs = activeShelves(copy).filter((s) => byId.get(s.category_id)?.parent_id)
    for (const s of subs) bump(counts.sub, s.category_id)
    if (main && !subs.some((s) => byId.get(s.category_id).parent_id === main)) bump(counts.noSub, main)
    for (const id of otherMainIds(copy, categories)) bump(counts.also, id)
  }
  return counts
}
