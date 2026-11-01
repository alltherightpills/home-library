// Works out what saving the vote's results would change, from the library's rows
// as they are now. Changes nothing itself. The owner's choices always stay, so
// running the plan again after saving finds nothing to do.

import { SOURCE_NAMES, voteCategories } from '../../src/categories/vote.js'

const describe = (votes) => votes.map((v) => `${SOURCE_NAMES[v.source]} +${v.weight}: ${v.because}`)

// The database reorders a stored object's keys, so compare with the keys sorted.
const canonical = (value) => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v)

const rowKey = (row) => `${row.copy_id}|${row.category_id}`

export function planVoteResults({ copies, categories, book_categories, lookups }) {
  const mains = new Map(categories.filter((c) => !c.parent_id).map((c) => [c.name, c.id]))
  const subs = new Map(categories.filter((c) => c.parent_id).map((c) => [`${c.parent_id}|${c.name}`, c.id]))
  const idOf = (main, sub) => {
    const id = sub ? subs.get(`${mains.get(main)}|${sub}`) : mains.get(main)
    if (!id) throw new Error(`No category called ${sub ? `${main} > ${sub}` : main}. Run npm run categories:setup. Nothing was changed.`)
    return id
  }

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
    const shelves = []
    if (!keepsOwnerShelf && result.main) {
      shelves.push({ category_id: idOf(result.main), is_main: true, tentative: false, reasons: [result.mainBecause] })
      for (const s of result.subs) {
        shelves.push({ category_id: idOf(result.main, s.sub), is_main: false, tentative: Boolean(s.tentative), reasons: describe(s.votes) })
      }
    }
    for (const shelf of shelves) {
      // The owner's row on this shelf stays, even when the vote wants it as the main shelf.
      if (ownerHas.has(`${copy.id}|${shelf.category_id}`)) {
        if (shelf.is_main) conflicts.push(copy.title)
        continue
      }
      wanted.push({ library_id: copy.library_id, copy_id: copy.id, set_by: 'vote', removed: false, ...shelf })
    }

    const review = keepsOwnerShelf ? [] : result.review
    const suggestions = keepsOwnerShelf || result.subs.length ? [] : result.nearMisses.map(({ sub, score }) => ({ sub, score }))
    const category_review = review.length || suggestions.length ? { flags: review, suggestions } : null
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
