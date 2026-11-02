// Turning the vote's result into what's saved: shelf rows, audience, and review
// notes. Shared by `npm run categories:save` (the whole library) and Scan to add
// (one new book), so a new book is filed the way the backlog was.

import { SOURCE_NAMES } from './vote.js'

const describe = (votes) => votes.map((v) => `${SOURCE_NAMES[v.source]} +${v.weight}: ${v.because}`)

// A function from a category name (and subcategory name) to its id.
export function categoryIds(categories) {
  const mains = new Map(categories.filter((c) => !c.parent_id).map((c) => [c.name, c.id]))
  const subs = new Map(categories.filter((c) => c.parent_id).map((c) => [`${c.parent_id}|${c.name}`, c.id]))
  return (main, sub) => {
    const id = sub ? subs.get(`${mains.get(main)}|${sub}`) : mains.get(main)
    if (!id) throw new Error(`No category called ${sub ? `${main} > ${sub}` : main}. Run npm run categories:setup. Nothing was changed.`)
    return id
  }
}

// The vote's shelves for a book: { category_id, is_main, tentative, reasons }.
export function voteShelves(result, idOf) {
  if (!result.main) return []
  return [
    { category_id: idOf(result.main), is_main: true, tentative: false, reasons: [result.mainBecause] },
    ...result.subs.map((s) => ({
      category_id: idOf(result.main, s.sub), is_main: false, tentative: Boolean(s.tentative), reasons: describe(s.votes),
    })),
  ]
}

// The review notes for copies.category_review, or null when there's nothing to review.
// Suggestions are the near misses, offered only when no subcategory was chosen.
export function voteReview(result) {
  const suggestions = result.subs.length ? [] : result.nearMisses.map(({ sub, score }) => ({ sub, score }))
  return result.review.length || suggestions.length ? { flags: result.review, suggestions } : null
}
