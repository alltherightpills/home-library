// Pick for me's rules (handoff.md, "Pick for me"): which books can be picked,
// which match the answers, what order picks come in, and why each was picked.
// The screen is PickForMe.jsx.

import { activeShelves, otherMainIds, shelfText } from './categories/review.js'
import { atHome, readCopyIds } from './readings.js'

// Question 2. Thresholds from the unread books' page counts (decisions-log.md,
// 2026-11-18); the buttons say Short / Medium / Long and the why line gives pages.
export const LENGTHS = [
  { id: 'short', label: 'Short', words: 'under 200 pages', test: (p) => p < 200 },
  { id: 'medium', label: 'Medium', words: '200–399 pages', test: (p) => p >= 200 && p < 400 },
  { id: 'long', label: 'Long', words: '400+ pages', test: (p) => p >= 400 },
]

// Question 3: "new" is first published in the last 10 years (2016 on, in 2026).
export const NEW_YEARS = 10
export const isNew = (year, thisYear) => year >= thisYear - NEW_YEARS

export const AUDIENCES = ['Adult', 'Teen', 'Kids']

// No question answered yet: Adult only (owner's choice, 2026-11-20).
export const BLANK_ANSWERS = { audience: ['Adult'], main: null, sub: null, length: null, published: null, author: null, waited: false }

const mainOf = (copy) => activeShelves(copy).find((s) => s.is_main)?.category_id ?? null
const workOf = (copy) => copy.work?.id ?? `copy:${copy.id}`

// Nonfiction › Reference: never picked (owner, 2026-11-19).
export function referenceId(categories) {
  const nonfiction = categories.find((c) => !c.parent_id && c.name === 'Nonfiction')
  return categories.find((c) => c.parent_id === nonfiction?.id && c.name === 'Reference')?.id ?? null
}

// The books Pick for me can choose from: at home, unread, not lent out, not
// being read now, not reference, one copy per work. `lentTo` is the map from
// lending.js; `readings` the reading list.
export function pickPool(copies, { readings, lentTo, categories }) {
  const read = readCopyIds(readings, copies)
  const readingNow = new Set(copies.filter((c) => (readings ?? []).some((r) => r.status === 'reading' && r.copy_id === c.id)).map(workOf))
  const reference = referenceId(categories)
  const seen = new Set()
  const pool = []
  for (const copy of copies) {
    const work = workOf(copy)
    if (seen.has(work) || !atHome(copy) || read.has(copy.id) || readingNow.has(work) || lentTo.has(copy.id)) continue
    if (reference && activeShelves(copy).some((s) => s.category_id === reference)) continue
    seen.add(work)
    pool.push(copy)
  }
  return pool
}

// Everyone credited as Author on a book you've read (any copy, home or office).
export function readAuthorIds(copies, readings) {
  const read = readCopyIds(readings, copies)
  return new Set(copies.filter((c) => read.has(c.id)).flatMap(authorIds))
}
// Who a book is "by" for the Author question: its authors; with none, its
// editors, so an anthology's story writers (Contributors) don't count; with
// neither, LibraryThing's other main credits. Not people who only wrote an
// introduction, translated or illustrated (owner, 2026-11-20).
const EDITOR_ROLES = ['Editor', 'Compiler']
const OTHER_ROLES = ['Creator', 'Primary Contributor', 'Original Author', 'Contributor']
function credited(copy) {
  const people = copy.work?.contributors ?? []
  const ids = (roles) => people.filter((p) => roles.includes(p.role)).map((p) => p.author.id)
  const authors = ids(['Author'])
  if (authors.length) return { ids: authors, edited: false }
  const editors = ids(EDITOR_ROLES)
  if (editors.length) return { ids: editors, edited: true }
  return { ids: ids(OTHER_ROLES), edited: false }
}
const authorIds = (copy) => credited(copy).ids

// Does a book pass every answered question? A book missing the information a
// question needs passes it (a missing answer never hides a book).
export function matches(copy, answers, { categories, readAuthors, thisYear }) {
  if (copy.audience && !answers.audience.includes(copy.audience)) return false
  if (answers.sub) {
    if (!activeShelves(copy).some((s) => s.category_id === answers.sub)) return false
  } else if (answers.main) {
    if (mainOf(copy) !== answers.main && !otherMainIds(copy, categories).has(answers.main)) return false
  }
  if (answers.length && copy.pages) {
    if (!LENGTHS.find((l) => l.id === answers.length).test(copy.pages)) return false
  }
  const year = copy.work?.first_published_year
  if (answers.published && year) {
    if (isNew(year, thisYear) !== (answers.published === 'new')) return false
  }
  const authors = authorIds(copy)
  if (answers.author && authors.length) {
    if (authors.some((id) => readAuthors.has(id)) !== (answers.author === 'known')) return false
  }
  return true
}

// Surprise me: every question ignored, adult books only (owner, 2026-11-20).
export const surprising = (copy) => copy.audience === 'Adult'

// The order picks are shown in: random, or with "Longest waiting first" the
// oldest bookplate year first (random among the same year), no year last.
export function pickOrder(books, { waited = false, random = Math.random } = {}) {
  const shuffled = books.map((b) => [random(), b]).sort((a, b) => a[0] - b[0]).map(([, b]) => b)
  if (!waited) return shuffled
  const year = (b) => b.acquired_year ?? Infinity
  return shuffled.sort((a, b) => year(a) - year(b))
}

// Why a book was picked: its shelf, then what it matched, then how long it's
// waited. "Fiction › Fantasy · 200–399 pages · by an author you've read · on
// your shelf since 2014". A question the book had no information for says so.
export function whyText(copy, answers, { categories, readAuthors, surprise = false }) {
  const parts = []
  if (surprise) parts.push('Surprise pick')
  const shelf = shelfText(copy, categories).main
  if (shelf) parts.push(shelf)
  if (copy.audience && copy.audience !== 'Adult') parts.push(copy.audience)
  if (!surprise) {
    if (answers.length) parts.push(copy.pages ? LENGTHS.find((l) => l.test(copy.pages)).words : 'page count unknown')
    const year = copy.work?.first_published_year
    if (answers.published) parts.push(year ? `first published ${year}` : 'year first published unknown')
    if (answers.author) {
      const { ids, edited } = credited(copy)
      const known = ids.some((id) => readAuthors.has(id))
      if (!ids.length) parts.push('author unknown')
      else if (edited) parts.push(known ? 'edited by someone you’ve read' : 'an editor new to you')
      else parts.push(known ? 'by an author you’ve read' : 'an author new to you')
    }
  }
  if (copy.acquired_year) parts.push(`on your shelf since ${copy.acquired_year}`)
  else if (answers.waited && !surprise) parts.push('year acquired unknown')
  return parts.join(' · ')
}
