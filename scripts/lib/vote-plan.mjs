// Works out what saving the vote's results would change, from the library's rows
// as they are now. Changes nothing itself. The owner's choices always stay, so
// running the plan again after saving finds nothing to do.

import { voteCategories } from '../../src/categories/vote.js'
import { categoryIds, voteReview, voteShelves } from '../../src/categories/voteResults.js'

// The database reorders a stored object's keys, so compare with the keys sorted.
const canonical = (value) => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v)

const rowKey = (row) => `${row.copy_id}|${row.category_id}`

export function planVoteResults({ copies, categories, book_categories, lookups }) {
  const idOf = categoryIds(categories)

  const saved = new Map(lookups.filter((l) => l.found).map((l) => [`${l.source}|${l.isbn}`, l.data]))
  const ownerRows = book_categories.filter((r) => r.set_by === 'owner')
  const ownerHas = new Set(ownerRows.map(rowKey))
  const ownerMain = new Set(ownerRows.filter((r) => r.is_main).map((r) => r.copy_id))

  const books = []
  const wanted = []
  const conflicts = []
  for (const copy of copies) {
    const key = copy.isbn13 ?? copy.isbn10 ?? `copy:${copy.id}`
    const result = voteCategories(copy, {
      locSearch: saved.get(`loc_search|${key}`),
      google: saved.get(`google|${key}`),
      openlibrary: saved.get(`openlibrary|${key}`),
    })
    const keepsOwnerShelf = ownerMain.has(copy.id)
    const shelves = keepsOwnerShelf ? [] : voteShelves(result, idOf)
    for (const shelf of shelves) {
      // The owner's row on this shelf stays, even when the vote wants it as the main shelf.
      if (ownerHas.has(`${copy.id}|${shelf.category_id}`)) {
        if (shelf.is_main) conflicts.push(copy.title)
        continue
      }
      wanted.push({ library_id: copy.library_id, copy_id: copy.id, set_by: 'vote', removed: false, ...shelf })
    }

    const category_review = keepsOwnerShelf ? null : voteReview(result)
    const changes = {}
    if (copy.audience_set_by !== 'owner' && (copy.audience !== result.audience || copy.audience_set_by !== 'vote')) {
      changes.audience = result.audience
      changes.audience_set_by = 'vote'
    }
    if (canonical(copy.category_review ?? null) !== canonical(category_review)) changes.category_review = category_review
    books.push({ copy, result, keepsOwnerShelf, changes })
  }

  const current = new Map(book_categories.filter((r) => r.set_by === 'vote').map((r) => [rowKey(r), r]))
  const wantedKeys = new Set(wanted.map(rowKey))
  const toRemove = [...current.values()].filter((r) => !wantedKeys.has(rowKey(r)))
  const toSave = wanted.filter((row) => {
    const now = current.get(rowKey(row))
    return !now || now.is_main !== row.is_main || now.tentative !== row.tentative || canonical(now.reasons) !== canonical(row.reasons)
  })
  return { books, wanted, toSave, toRemove, conflicts, booksToChange: books.filter((b) => Object.keys(b.changes).length) }
}

export const planIsEmpty = (plan) => !plan.toSave.length && !plan.toRemove.length && !plan.booksToChange.length
