// Pick for me's assessment pass (handoff.md, "Slice D process"): choosing the
// next batch of books from a backup, the two files written for it, and reading
// the finished review file back for the loader.
//
// Two files per batch, both in data/assessments/ (private):
// - the worksheet, for Claude: each book's facts (categories, credits, saved
//   publisher description, genres, subject headings, answers already saved);
// - the review file, for the owner and the loader: one block per book with the
//   four answers, the synopsis, a "Why" line and a "Your fix" line. What the
//   owner checks is exactly what `npm run assessments:save` saves.

import { QUESTIONS, answerCode, answerWords } from './assessments.js'
import { notYetAssessed } from './pick.js'
import { shelfParts, shelfText } from './categories/review.js'
import { subjectHeadings } from './subjectHeadings.js'

// ---------------------------------------------------------------------------
// From backup tables to the app's copies (the shape useCatalog.js loads)
// ---------------------------------------------------------------------------

export function catalogCopies({ copies, works, authors, work_authors, book_categories, assessments }) {
  const authorById = new Map(authors.map((a) => [a.id, a]))
  const group = (rows, key) => {
    const map = new Map()
    for (const row of rows) {
      if (!map.has(row[key])) map.set(row[key], [])
      map.get(row[key]).push(row)
    }
    return map
  }
  const creditsByWork = group(work_authors, 'work_id')
  const answersByWork = group(assessments, 'work_id')
  const shelvesByCopy = group(book_categories, 'copy_id')
  const workById = new Map(
    works.map((w) => [
      w.id,
      {
        ...w,
        contributors: (creditsByWork.get(w.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((c) => ({ role: c.role, position: c.position, author: authorById.get(c.author_id) })),
        assessments: answersByWork.get(w.id) ?? [],
      },
    ]),
  )
  return copies.map((c) => ({ ...c, shelves: shelvesByCopy.get(c.id) ?? [], work: workById.get(c.work_id) ?? null }))
}

// ---------------------------------------------------------------------------
// The next batch
// ---------------------------------------------------------------------------

// Adult books first (with the few that have no audience), kids and teen later,
// when the owner decides they're worth it (owner, 2026-11-20).
export const AUDIENCE_GROUPS = {
  adult: (copy) => !copy.audience || copy.audience === 'Adult',
  'kids-teen': (copy) => copy.audience === 'Kids' || copy.audience === 'Teen',
}

// Like books together (owner, 2026-11-23): main category, then first
// subcategory, in the category list's order; then title.
function groupOf(copy, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const position = (id) => byId.get(id)?.position ?? 999
  const { mainShelf, subs } = shelfParts(copy, categories)
  const sub = subs.map((s) => s.category_id).sort((a, b) => position(a) - position(b))[0]
  const main = mainShelf?.category_id
  return {
    order: [main ? position(main) : 999, sub ? position(sub) : 999],
    name: [byId.get(main)?.name ?? 'No category', byId.get(sub)?.name].filter(Boolean).join(' › '),
  }
}

// The group a book is batched in, like "Fiction › Fantasy", for the summary.
export const groupName = (copy, categories) => groupOf(copy, categories).name

export function categoryOrder(books, categories) {
  const key = (copy) => [...groupOf(copy, categories).order, (copy.work?.title ?? copy.title).toLowerCase()]
  const keys = new Map(books.map((b) => [b, key(b)]))
  return [...books].sort((a, b) => {
    const [x, y] = [keys.get(a), keys.get(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2])
  })
}

// The books still to assess in one audience group, in batch order. A batch is
// the first `size` of them; a later backup (after loading) moves the list on.
export function remainingBooks(copies, { readings, categories, audience = 'adult' }) {
  const books = notYetAssessed(copies, { readings, categories }).filter(AUDIENCE_GROUPS[audience])
  return categoryOrder(books, categories)
}

// ---------------------------------------------------------------------------
// Facts for the worksheet
// ---------------------------------------------------------------------------

// A saved Google description as plain text: tags out, entities decoded.
export function plainText(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

const lookupKey = (copy) => copy.isbn13 ?? copy.isbn10 ?? `copy:${copy.id}`

// Google descriptions by lookup key (an ISBN).
export function descriptionsByKey(lookups) {
  const map = new Map()
  for (const l of lookups) {
    const text = l.found && l.source === 'google' ? plainText(l.data?.volumeInfo?.description) : ''
    if (text) map.set(l.isbn, text)
  }
  return map
}

// What Claude reads to judge one book. Descriptions, genres and subjects are
// gathered from every copy of the work, since editions share the answers.
export function bookFacts(copy, { copies, categories, descriptions }) {
  const editions = copies.filter((c) => c.work_id === copy.work_id)
  const unique = (list) => [...new Set(list.filter(Boolean))]
  const shelves = shelfText(copy, categories)
  const credits = (copy.work?.contributors ?? []).filter((c) => c.author)
  return {
    workId: copy.work_id,
    title: copy.work?.title ?? copy.title,
    byline: credits.filter((c) => c.role === 'Author').map((c) => c.author.display_name).join(', '),
    credits: credits.map((c) => `${c.author.display_name} (${c.role})`),
    category: shelves.main,
    alsoIn: shelves.alsoIn,
    audience: copy.audience,
    firstPublished: copy.work?.first_published_year,
    pages: copy.pages,
    originalTitle: copy.original_title,
    languages: unique(editions.flatMap((c) => c.languages ?? [])),
    editionNote: copy.edition_note,
    description: unique(editions.map((c) => descriptions.get(lookupKey(c)))).sort((a, b) => b.length - a.length)[0] ?? '',
    genres: unique(editions.flatMap((c) => c.lt_genres ?? [])),
    subjects: unique(editions.flatMap(subjectHeadings)),
    saved: copy.work?.assessments ?? [],
    synopsis: copy.work?.synopsis,
    synopsisSetBy: copy.work?.synopsis_set_by,
  }
}

const savedText = (rows) =>
  QUESTIONS.map((q) => rows.find((r) => r.question === q.id))
    .filter(Boolean)
    .map((r) => `${r.question} ${answerWords(r.answer)}${r.sure ? '' : '?'} (${r.set_by === 'owner' ? 'owner' : 'Claude'})`)
    .join(', ')

const heading = (n, f) => `### ${n}. ${f.title}${f.byline ? ` (${f.byline})` : ''}${f.category ? `, ${f.category}` : ''}`

export function worksheetText(facts, { batch, snapshot, remaining }) {
  const lines = [
    `# Batch ${batch} worksheet (private)`,
    '',
    `For Claude: the facts to judge each book by. From backup ${snapshot}; ${facts.length} books, ${remaining} left in this audience group after this batch.`,
    'Read assessment-guide.md and data/assessment-examples.md first.',
    '',
  ]
  facts.forEach((f, i) => {
    lines.push(heading(i + 1, f))
    const row = (label, value) => value && value.length !== 0 && lines.push(`- ${label}: ${value}`)
    row('Credits', f.credits.join('; '))
    row('Also in', f.alsoIn.join('; '))
    row('Audience', f.audience)
    row('First published', f.firstPublished)
    row('Pages', f.pages)
    row('Original title', f.originalTitle)
    row('Languages', f.languages.join(', '))
    row('Edition note', f.editionNote)
    row('Genres', f.genres.join(', '))
    row('Subjects', f.subjects.join('; '))
    row('Saved already', savedText(f.saved))
    if (f.synopsisSetBy === 'owner') row("Owner's synopsis", f.synopsis)
    lines.push(f.description ? `- Description: ${f.description.replace(/\n/g, ' / ')}` : '- Description: none saved')
    lines.push('')
  })
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The review file
// ---------------------------------------------------------------------------

export const TODO = 'TODO'

export function reviewText(facts, { batch, snapshot }) {
  const lines = [
    `# Batch ${batch} (private)`,
    '',
    `Claude's answers for ${facts.length} unread books (backup ${snapshot}), by assessment-guide.md.`,
    '',
    'Order on each Answers line: **International · Driven · Pace · Mood**. A **?** after an',
    'answer means unsure. Mood is the stored value: In between shows as "Not heavy"',
    'in Pick for me, together with Light.',
    '',
    'Each **Why** line is saved as the book\'s reading notes, shown on its book page as',
    '"Reading notes (Claude)" (assessment-guide.md, "Reading notes").',
    '',
    '**How to check:** if anything is wrong, write the fix on the "Your fix" line',
    '(e.g. "pace steady, mood heavy", or a better synopsis). Leave it blank if it\'s',
    'right. Claude applies the fixes (marked "(owner)") before the file is saved;',
    'the loader refuses a file with a fix still on a "Your fix" line.',
    '',
    '---',
    '',
  ]
  facts.forEach((f, i) => {
    lines.push(heading(i + 1, f), `<!-- work ${f.workId} -->`)
    if (f.saved.length) lines.push(`Saved already: ${savedText(f.saved)}`)
    lines.push(`Answers: ${TODO}`, `Synopsis: ${f.synopsisSetBy === 'owner' ? `(owner) ${f.synopsis}` : TODO}`, 'Why:', '- Your fix:', '')
  })
  return lines.join('\n')
}

// One answer from an Answers line: "Steady", "Heavy?", "Slow (owner)",
// "Doesn't apply", or "-" for no answer.
function readAnswer(question, token) {
  const text = token.trim()
  if (/^[-–—]$/.test(text)) return { none: true }
  const owner = /\(owner\)\s*$/i.test(text)
  const rest = text.replace(/\(owner\)\s*$/i, '').trim()
  const unsure = rest.endsWith('?')
  const code = answerCode(question.id, rest.replace(/\?$/, ''))
  if (!code) return { problem: `"${text}" isn't an answer to ${question.label}` }
  if (owner && unsure) return { problem: `"${text}": the owner's answers are sure` }
  return { answer: code, sure: !unsure, set_by: owner ? 'owner' : 'claude' }
}

// A finished review file → the loader's answers, synopses and reading notes
// (each book's Why line), or the problems that stop it. Every book needs an
// Answers and a Synopsis line, no TODO left, and an empty "Your fix" line.
//
// notesOnly reads just the Why lines, for a notes file: the same "### " and
// "<!-- work … -->" lines with a Why line each, and no Answers or Synopsis
// (used to backfill batches 1–3, whose answers the owner may have changed
// since; 2026-11-23).
export function parseReview(text, { notesOnly = false } = {}) {
  const answers = []
  const synopses = []
  const notes = []
  const problems = []
  const seen = new Set()
  const blocks = text.split(/^(?=### )/m).filter((b) => b.startsWith('### '))
  if (!blocks.length) problems.push('No books found (each starts with "### ").')
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim())
    const title = lines[0].replace(/^###\s*\d*\.?\s*/, '')
    const where = title.length > 60 ? `${title.slice(0, 57)}…` : title
    const workId = block.match(/<!-- work ([0-9a-f-]{36}) -->/)?.[1]
    if (!workId) {
      problems.push(`${where}: no "<!-- work … -->" line`)
      continue
    }
    if (seen.has(workId)) problems.push(`${where}: this book is in the file twice`)
    seen.add(workId)

    const why = lines.find((l) => l.startsWith('Why:'))?.slice('Why:'.length).trim()
    if (notesOnly && why == null) problems.push(`${where}: no Why line`)
    else if (why === TODO) problems.push(`${where}: Why not written yet`)
    else if (why) notes.push({ work_id: workId, notes: why, title })
    if (notesOnly) continue

    const answerLine = lines.find((l) => l.startsWith('Answers:'))?.slice('Answers:'.length).trim()
    if (answerLine == null) problems.push(`${where}: no Answers line`)
    else if (answerLine === TODO) problems.push(`${where}: answers not written yet`)
    else {
      const tokens = answerLine.split('·')
      if (tokens.length !== QUESTIONS.length) problems.push(`${where}: ${tokens.length} answers, not ${QUESTIONS.length}`)
      else
        QUESTIONS.forEach((q, i) => {
          const read = readAnswer(q, tokens[i])
          if (read.problem) problems.push(`${where}: ${read.problem}`)
          else if (!read.none) answers.push({ work_id: workId, question: q.id, answer: read.answer, sure: read.sure, set_by: read.set_by, title })
        })
    }

    const synopsisLine = lines.find((l) => l.startsWith('Synopsis:'))?.slice('Synopsis:'.length).trim()
    if (synopsisLine == null) problems.push(`${where}: no Synopsis line`)
    else if (synopsisLine === TODO) problems.push(`${where}: synopsis not written yet`)
    else if (synopsisLine && synopsisLine !== '-') {
      const owner = synopsisLine.startsWith('(owner)')
      synopses.push({ work_id: workId, synopsis: synopsisLine.replace(/^\(owner\)/, '').trim(), set_by: owner ? 'owner' : 'claude', title })
    }

    const fix = lines.find((l) => l.startsWith('- Your fix:'))?.slice('- Your fix:'.length).trim()
    if (fix) problems.push(`${where}: a fix is still on the "Your fix" line ("${fix}")`)
  }
  return { answers, synopses, notes, problems }
}

// What the loader does with each reading note: save new and changed ones,
// skip one already saved as it is. Notes are Claude's alone (not editable in
// the app), so a newer note simply replaces the old.
export function planNotes(notes, works) {
  const plan = { save: [], same: 0, missing: [] }
  for (const n of notes) {
    const work = works.get(n.work_id)
    if (!work) plan.missing.push(n.title ?? n.work_id)
    else if (work.reading_notes === n.notes) plan.same++
    else plan.save.push(n)
  }
  return plan
}

// What the loader does with each synopsis: never replace the owner's with
// Claude's; skip one already saved as it is.
export function planSynopses(synopses, works) {
  const plan = { save: [], same: 0, keptOwners: [], missing: [] }
  for (const s of synopses) {
    const work = works.get(s.work_id)
    if (!work) plan.missing.push(s.title ?? s.work_id)
    else if (work.synopsis_set_by === 'owner' && s.set_by === 'claude') {
      if (work.synopsis !== s.synopsis) plan.keptOwners.push(work.title)
    } else if (work.synopsis === s.synopsis && work.synopsis_set_by === s.set_by) plan.same++
    else plan.save.push(s)
  }
  return plan
}
