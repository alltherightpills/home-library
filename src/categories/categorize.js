// Applies the rules in category-rules.js to one book (a row of `copies`).

import { AUDIENCE_RULES, MAIN_RULES, SUBCATEGORY_RULES } from './category-rules.js'

const trimEnd = (text) => text.trim().replace(/[\s.,;:/]+$/, '')

// The Dewey number without prime marks ("813/.52" → "813.52"), or ''.
function deweyOf(copy) {
  const dewey = (copy.dewey ?? '').replace(/[/']/g, '')
  return /^\d{3}/.test(dewey) ? dewey : ''
}

// The LC class and number, from LC's own record when it has a real one, else
// LibraryThing's. "CPB Box no." and "MLCS 2011/…" are LC shelf numbers, not classes.
function lcOf(copy) {
  for (const call of [copy.lc_call_number, copy.lcc]) {
    const match = /^([A-Z]{1,3})\s*(\d+)?/.exec((call ?? '').trim())
    if (match && !/^(CPB|MLC)/.test(call.trim())) return { lcClass: match[1], lcNumber: match[2] ? Number(match[2]) : null, call: call.trim() }
  }
  return { lcClass: '', lcNumber: null, call: '' }
}

// Every subject heading and genre/form term as text, e.g. "Love -- Poetry".
function headingsOf(copy) {
  const headings = copy.subjects.map((parts) => parts.map(trimEnd).join(' -- '))
  for (const field of copy.lc_subjects) {
    const sub = field.sub ?? []
    const nameCodes = ['600', '610', '611'].includes(field.tag) ? 'abcdqt' : 'a'
    const name = sub.filter(([code]) => nameCodes.includes(code)).map(([, v]) => trimEnd(v)).join(' ')
    const subdivisions = sub.filter(([code]) => 'vxyz'.includes(code)).map(([, v]) => trimEnd(v))
    headings.push([name, ...subdivisions].join(' -- '))
  }
  return headings.filter(Boolean)
}

// The clues a book carries, gathered once. The title leaves out anything in
// brackets, which is usually a series or edition ("(Vega Family Love Stories)").
export function cluesOf(copy) {
  const title = copy.title.replace(/\(.*?\)|\[.*?\]/g, '')
  return { dewey: deweyOf(copy), ...lcOf(copy), headings: headingsOf(copy), genres: copy.lt_genres, title }
}

// ---------------------------------------------------------------------------
// Matching one kind of clue; each returns a description of what matched, or null.
// ---------------------------------------------------------------------------

function deweyMatches(pattern, dewey) {
  if (!dewey) return false
  if (pattern.startsWith('*')) return dewey.replace('.', '').slice(3).includes(pattern.slice(1))
  const range = /^(\d{3})-(\d{3})$/.exec(pattern)
  if (range) {
    const whole = Number(dewey.slice(0, 3))
    return whole >= Number(range[1]) && whole <= Number(range[2])
  }
  return pattern.length <= dewey.length && [...pattern].every((ch, i) => ch === 'x' ? /\d/.test(dewey[i]) : ch === dewey[i])
}

function lcMatches(pattern, { lcClass, lcNumber }) {
  if (!lcClass) return false
  if (pattern.endsWith('*')) return lcClass.startsWith(pattern.slice(0, -1))
  const range = /^([A-Z]+)(\d+)-(\d+)$/.exec(pattern)
  if (range) return lcClass === range[1] && lcNumber !== null && lcNumber >= Number(range[2]) && lcNumber <= Number(range[3])
  return lcClass === pattern
}

function headingMatch(pattern, headings) {
  const words = pattern.toLowerCase()
  return headings.find((h) => h.toLowerCase().includes(words))
}

// Which clue (if any) satisfies `when`; returns e.g. 'Dewey 822.33' or null.
function firstMatch(when = {}, clues) {
  for (const pattern of when.dewey ?? []) if (deweyMatches(pattern, clues.dewey)) return `Dewey ${clues.dewey}`
  for (const pattern of when.lc ?? []) if (lcMatches(pattern, clues)) return `LC ${clues.call}`
  for (const pattern of when.heading ?? []) {
    const heading = headingMatch(pattern, clues.headings)
    if (heading) return `heading "${heading}"`
  }
  for (const genre of when.genre ?? []) if (clues.genres.includes(genre)) return `LibraryThing genre "${genre}"`
  for (const words of when.title ?? []) if (clues.title.toLowerCase().includes(words)) return `title has "${words}"`
  return null
}

export const ruleMatch = (rule, clues) => (firstMatch(rule.unless, clues) ? null : firstMatch(rule.when, clues))

// ---------------------------------------------------------------------------

// The first main-category rule these clues satisfy: { main, mainBecause }.
export function mainFromClues(clues) {
  for (const rule of MAIN_RULES) {
    const mainBecause = ruleMatch(rule, clues)
    if (mainBecause) return { main: rule.main, mainBecause }
  }
  return { main: null, mainBecause: null }
}

// The categories the rules give a book, and why:
// { main, mainBecause, subs: [{ sub, because }], audience, audienceBecause }
export function categorize(copy) {
  const clues = cluesOf(copy)
  const { main, mainBecause } = mainFromClues(clues)
  const subs = []
  for (const rule of SUBCATEGORY_RULES[main] ?? []) {
    const because = ruleMatch(rule, clues)
    if (because) subs.push({ sub: rule.sub, because })
  }
  let audience = 'Adult'
  let audienceBecause = null
  for (const rule of AUDIENCE_RULES) {
    audienceBecause = ruleMatch(rule, clues)
    if (audienceBecause) {
      audience = rule.audience
      break
    }
  }
  return { main, mainBecause, subs, audience, audienceBecause, clues }
}
