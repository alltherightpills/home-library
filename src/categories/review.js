// The review list's logic: which books are on it, and what deciding one saves.

export const REVIEW_FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'noMain', label: 'No main category', test: (flag) => flag === 'no main category' },
  { id: 'lean', label: 'Sources disagree', test: (flag) => flag.startsWith('sources lean') },
  { id: 'noSub', label: 'No subcategory', test: (flag) => flag === 'no subcategory' },
  { id: 'tentative', label: 'Tentative', test: (flag) => flag === 'tentative subcategory' },
]

export const inFilter = (copy, filter) =>
  Boolean(copy.category_review) && (filter.id === 'all' || copy.category_review.flags.some(filter.test))

// "sources lean Nonfiction (4)" → "Other sources lean Nonfiction".
export function flagText(flag) {
  const lean = flag.match(/^sources lean (.+) \(\d+\)$/)
  if (lean) return `Other sources lean ${lean[1]}`
  return { 'no main category': 'No main category', 'no subcategory': 'No subcategory', 'tentative subcategory': 'Tentative subcategory' }[flag] ?? flag
}

// The shelves a book is on now, ignoring ones the owner took it off.
export const activeShelves = (copy) => copy.shelves.filter((s) => !s.removed)

export function shelfParts(copy, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const active = activeShelves(copy)
  const mainShelf = active.find((s) => s.is_main)
  const alsoIn = active.filter((s) => !s.is_main && !byId.get(s.category_id)?.parent_id)
  const alsoInIds = new Set(alsoIn.map((s) => s.category_id))
  const allSubs = active.filter((s) => byId.get(s.category_id)?.parent_id)
  return {
    mainShelf,
    alsoIn,
    alsoInIds,
    allSubs,
    // Subcategories of an "also in" shelf belong to that shelf, not the main one.
    subs: allSubs.filter((s) => !alsoInIds.has(byId.get(s.category_id).parent_id)),
  }
}

// A book's shelves as text: "Fiction › Fantasy, Horror" for the main shelf, and the
// same for each "also in". A subcategory shows under its own main category, even
// if the book isn't on that main category's shelf.
export function shelfText(copy, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const { mainShelf, alsoIn, allSubs } = shelfParts(copy, categories)
  const position = (shelf) => byId.get(shelf.category_id)?.position ?? 0
  const line = (mainId) => {
    const subs = allSubs
      .filter((s) => byId.get(s.category_id).parent_id === mainId)
      .sort((a, b) => position(a) - position(b))
      .map((s) => byId.get(s.category_id).name + (s.tentative ? ' (tentative)' : ''))
    return [byId.get(mainId)?.name, subs.join(', ')].filter(Boolean).join(' › ')
  }
  const otherMains = new Set([
    ...alsoIn.map((s) => s.category_id),
    ...allSubs.map((s) => byId.get(s.category_id).parent_id),
  ])
  otherMains.delete(mainShelf?.category_id)
  return {
    main: mainShelf ? line(mainShelf.category_id) : '',
    alsoIn: [...otherMains].map(line),
  }
}

// What saving the owner's decision on a book writes. Every shelf that stays
// becomes the owner's, because the vote keeps a book's shelves only when its main
// shelf is the owner's, and deletes any vote rows left on it. `demote` is an old
// main shelf, which comes off first: a book can have only one main shelf.
export function planShelfDecision(copy, categories, mainId, subIds) {
  const { mainShelf, alsoInIds, allSubs } = shelfParts(copy, categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const reasons = new Map(copy.shelves.map((s) => [s.category_id, s.reasons]))
  const row = (category_id, fields) => ({
    library_id: copy.library_id,
    copy_id: copy.id,
    category_id,
    set_by: 'owner',
    tentative: false,
    reasons: reasons.get(category_id) ?? [],
    ...fields,
  })
  const keptSubs = [...subIds].filter((id) => byId.get(id)?.parent_id === mainId)
  const rows = [row(mainId, { is_main: true, removed: false })]
  for (const id of keptSubs) rows.push(row(id, { is_main: false, removed: false }))
  for (const { category_id } of allSubs) {
    const parent = byId.get(category_id).parent_id
    const onAlsoIn = alsoInIds.has(parent) && parent !== mainId
    if (!onAlsoIn && !keptSubs.includes(category_id)) rows.push(row(category_id, { is_main: false, removed: true }))
  }
  return { demote: mainShelf && mainShelf.category_id !== mainId ? mainShelf.category_id : null, rows }
}
