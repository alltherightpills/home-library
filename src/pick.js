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
export const BLANK_ANSWERS = {
  audience: ['Adult'],
  main: null,
  sub: null,
  length: null,
  published: null,
  author: null,
  international: null,
  driven: null,
  pace: null,
  mood: null,
  waited: false,
}

// Questions 6–9, judged by Claude (assessment-guide.md) and stored in the
// assessments table; the stored answers are in assessments.js. Each button
// says which stored answers rule a book out; any other answer, "doesn't
// apply", "not assessed" or no answer at all lets the book through. Unsure
// answers count like sure ones. (Owner, 2026-11-20.)
//
// Driven's buttons follow Kind: Narrative · Ideas for the nonfiction main
// categories, Character · Plot otherwise. "Both" never rules a book out, so
// Character means Character or Both, as Mood's Not heavy means Light or In
// between.
export const NONFICTION_MAINS = ['Nonfiction', 'Biography & Memoir', 'Essays, Letters & Criticism']
export const JUDGED = [
  {
    id: 'international',
    label: 'View',
    options: [
      { id: 'international', label: 'International', rulesOut: ['domestic'] },
      { id: 'domestic', label: 'Domestic', rulesOut: ['international'] },
    ],
  },
  {
    id: 'driven',
    label: 'Driven',
    options: [
      { id: 'character', label: 'Character', rulesOut: ['plot'], stories: true },
      { id: 'plot', label: 'Plot', rulesOut: ['character'], stories: true },
      { id: 'narrative', label: 'Narrative', rulesOut: ['ideas'], stories: false },
      { id: 'ideas', label: 'Ideas', rulesOut: ['narrative'], stories: false },
    ],
  },
  {
    id: 'pace',
    label: 'Pace',
    options: [
      { id: 'quick', label: 'Quick', rulesOut: ['steady', 'slow'] },
      { id: 'steady', label: 'Steady', rulesOut: ['quick', 'slow'] },
      { id: 'slow', label: 'Slow', rulesOut: ['quick', 'steady'] },
    ],
  },
  {
    id: 'mood',
    label: 'Mood',
    options: [
      { id: 'light', label: 'Light', rulesOut: ['in_between', 'heavy'] },
      { id: 'not_heavy', label: 'Not heavy', rulesOut: ['heavy'] },
      { id: 'heavy', label: 'Heavy', rulesOut: ['light', 'in_between'] },
    ],
  },
]

// Is the chosen main category a nonfiction one (Driven shows Narrative · Ideas)?
export const isNonfictionMain = (mainId, categories) => NONFICTION_MAINS.includes(categories.find((c) => c.id === mainId)?.name)

// The Driven buttons for the chosen Kind.
export const drivenOptions = (mainId, categories) => {
  const stories = !isNonfictionMain(mainId, categories)
  return JUDGED.find((q) => q.id === 'driven').options.filter((o) => o.stories === stories)
}

// A book's stored answer to a judged question: { answer, sure, set_by } or undefined.
export const judgedAnswer = (copy, question) => copy.work?.assessments?.find((a) => a.question === question)

const optionFor = (question, id) => JUDGED.find((q) => q.id === question).options.find((o) => o.id === id)

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
  for (const { id } of JUDGED) {
    if (!answers[id]) continue
    const stored = judgedAnswer(copy, id)?.answer
    if (stored && optionFor(id, answers[id]).rulesOut.includes(stored)) return false
  }
  return true
}

// The books an assessment pass should look at, and haven't all four answers
// yet: unread, at home, not reference, one copy per work. Unlike the pool,
// this keeps books lent out or being read, which are unread too.
export function notYetAssessed(copies, { readings, categories }) {
  const unread = pickPool(copies, { readings: (readings ?? []).filter((r) => r.status !== 'reading'), lentTo: new Map(), categories })
  return unread.filter((copy) => JUDGED.some(({ id }) => !judgedAnswer(copy, id)))
}

// How a judged answer reads in the why line; "?" when Claude was unsure.
const JUDGED_WORDS = {
  international: 'international',
  domestic: 'domestic',
  character: 'character-driven',
  plot: 'plot-driven',
  narrative: 'reads like a story',
  ideas: 'about ideas',
  quick: 'quick pace',
  steady: 'steady pace',
  slow: 'slow pace',
  light: 'light',
  in_between: 'between light and heavy',
  heavy: 'heavy',
}
function judgedWords(question, stored, chosen) {
  if (stored.answer === 'both') return optionFor(question, chosen).stories ? 'character and plot' : 'story and ideas'
  const words = JUDGED_WORDS[stored.answer]
  return words && (stored.sure ? words : `${words}?`)
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
    // The judged answers, then one note for the questions this book has no
    // answer to yet. "Doesn't apply" says nothing.
    const unanswered = []
    for (const { id, label } of JUDGED) {
      if (!answers[id]) continue
      const stored = judgedAnswer(copy, id)
      if (!stored || stored.answer === 'not_assessed') unanswered.push(label.toLowerCase())
      else if (stored.answer !== 'doesnt_apply') {
        const words = judgedWords(id, stored, answers[id])
        if (words) parts.push(words)
      }
    }
    if (unanswered.length) parts.push(`${unanswered.join(', ')} not yet assessed`)
  }
  if (copy.acquired_year) parts.push(`on your shelf since ${copy.acquired_year}`)
  else if (answers.waited && !surprise) parts.push('year acquired unknown')
  return parts.join(' · ')
}
