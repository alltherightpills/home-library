// The weighted vote: each source says which subcategories and audience it sees,
// and a choice stands once its votes reach the threshold, so no weak source
// decides alone. The rules in categorize.js still pick the main category; the
// vote only flags that when the other sources strongly disagree.

import { AUDIENCE_LABELS, AUDIENCE_RULES, LABEL_RULES, MAIN_LABELS, SUBCATEGORY_RULES } from './category-rules.js'
import { categorize, cluesOf, mainFromClues, ruleMatch } from './categorize.js'

export const WEIGHTS = { own: 3, lc: 2, google: 2, openlibrary: 1 }
export const THRESHOLD = 3
export const SOURCE_NAMES = { own: 'own record', lc: 'LC other editions', google: 'Google', openlibrary: 'Open Library' }

// LC's subject fields, as enrichment and the lookups store them.
const SUBJECT_TAGS = ['600', '610', '611', '630', '650', '651', '655']

const subfield = (record, tag, codes) =>
  record.fields.find((f) => f.tag === tag)?.sub.filter(([c]) => codes.includes(c)).map(([, v]) => v).join(' ') ?? ''

// One LC record's clues, in the same shape as a book's. LibraryThing's genres are
// left out here and for the book's own record, so later books are judged alike.
function cluesFromMarc(record) {
  return cluesOf({
    title: subfield(record, '245', 'ab'),
    dewey: subfield(record, '082', 'a'),
    lc_call_number: subfield(record, '050', 'ab'),
    lcc: null,
    subjects: [],
    lc_subjects: record.fields.filter((f) => SUBJECT_TAGS.includes(f.tag)),
    lt_genres: [],
  })
}

const tidy = (label) => label.toLowerCase().replace(/-/g, ' ')

function labelMatch(patterns, labels) {
  for (const pattern of patterns) {
    const found = pattern.startsWith('^')
      ? labels.find((l) => tidy(l).startsWith(pattern.slice(1)))
      : labels.find((l) => tidy(l).includes(pattern))
    if (found) return `"${found}"`
  }
  return null
}

// What each source can offer: clues (a list, for rules) or labels (for the table).
function sourcesFor(copy, answers) {
  return {
    own: { clues: [cluesOf({ ...copy, lt_genres: [] })] },
    lc: { clues: (answers.locSearch?.records ?? []).map(cluesFromMarc) },
    google: { labels: answers.google?.volumeInfo?.categories ?? [] },
    openlibrary: { labels: answers.openlibrary?.subject ?? [] },
  }
}

// Asks one source about one choice: its reason for saying yes, or null.
function sourceSays(source, viaRule, viaLabels) {
  if (source.labels) return viaLabels(source.labels)
  for (const clues of source.clues) {
    const because = viaRule(clues)
    if (because) return because
  }
  return null
}

const total = (votes) => votes.reduce((sum, v) => sum + v.weight, 0)

function tally(sources, viaRule, viaLabels) {
  const votes = []
  for (const [name, source] of Object.entries(sources)) {
    const because = sourceSays(source, viaRule, viaLabels)
    if (because) votes.push({ source: name, weight: WEIGHTS[name], because })
  }
  return votes
}

function voteSubcategories(main, sources) {
  const labelsBySub = LABEL_RULES[main] ?? {}
  const rules = SUBCATEGORY_RULES[main] ?? []
  const names = [...new Set([...rules.map((r) => r.sub), ...Object.keys(labelsBySub)])]
  return names
    .map((sub) => {
      const rule = rules.find((r) => r.sub === sub)
      const votes = tally(
        sources,
        (clues) => (rule ? ruleMatch(rule, clues) : null),
        (labels) => labelMatch(labelsBySub[sub] ?? [], labels),
      )
      return { sub, score: total(votes), votes }
    })
    .filter((s) => s.votes.length)
}

// Kids and Teen together must reach the threshold ("juvenile fiction" may mean
// either); then Teen needs more than Open Library alone to win over Kids.
function voteAudience(sources) {
  const said = (audience) => tally(
    sources,
    (clues) => {
      for (const rule of AUDIENCE_RULES) {
        const because = ruleMatch(rule, clues)
        if (because) return rule.audience === audience ? because : null
      }
      return null
    },
    (labels) => {
      for (const { audience: a, labels: patterns } of AUDIENCE_LABELS) {
        const because = labelMatch(patterns, labels)
        if (because) return a === audience ? because : null
      }
      return null
    },
  )
  const teen = said('Teen')
  const kids = said('Kids')
  const votes = [...teen, ...kids]
  if (total(votes) < THRESHOLD) return { audience: 'Adult', votes }
  return { audience: total(teen) >= 2 ? 'Teen' : 'Kids', votes }
}

// Main category per LC and Google, to catch the rules' misfires. Open Library's
// subjects are pooled across editions, too noisy to overrule anything.
function otherMains(main, sources) {
  const scores = new Map()
  const add = (name, weight) => { if (name) scores.set(name, (scores.get(name) ?? 0) + weight) }
  const lcMains = new Set(sources.lc.clues.map((clues) => mainFromClues(clues).main))
  // LC's editions count only when they agree with one another.
  if (lcMains.size === 1) add([...lcMains][0], WEIGHTS.lc)
  const first = sources.google.labels[0]
  if (first?.includes('/')) {
    add(MAIN_LABELS.find((m) => labelMatch(m.labels, [first]))?.main ?? 'Nonfiction', WEIGHTS.google)
  }
  add(mainFromClues(sources.own.clues[0]).main, WEIGHTS.own)
  const mine = scores.get(main) ?? 0
  return [...scores].filter(([name, score]) => name !== main && score > mine && score >= WEIGHTS.lc + WEIGHTS.google)
}

// A book's result. `answers` holds the saved lookups: { locSearch, google, openlibrary }.
export function voteCategories(copy, answers = {}) {
  const { main, mainBecause, clues } = categorize(copy)
  const sources = sourcesFor(copy, answers)
  const considered = voteSubcategories(main, sources)
  const subs = considered.filter((s) => s.score >= THRESHOLD)
  const { audience, votes: audienceVotes } = voteAudience(sources)

  const review = []
  if (!main) review.push('no main category')
  else if ((SUBCATEGORY_RULES[main] ?? LABEL_RULES[main]) && !subs.length) review.push('no subcategory')
  for (const [name, score] of otherMains(main, sources)) review.push(`sources lean ${name} (${score})`)

  return { main, mainBecause, subs, nearMisses: considered.filter((s) => s.score < THRESHOLD), audience, audienceVotes, review, clues }
}
