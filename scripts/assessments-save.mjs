// Saves a file of Pick for me's judged answers (src/assessments.js), and
// synopses, to the library. Claude writes the file in an assessment session;
// the owner runs this.
//
//   npm run assessments:save -- data/assessments/batch-01-2026-11-23.md
//   npm run assessments:save -- data/assessments/2026-11-20-examples-and-trial.json
//
//   npm run assessments:save -- data/assessments/batch-01-2026-11-23-notes.md --notes-only
//
// A batch's review file (.md, made by `npm run assessments:batch`, read by
// parseReview in src/assessmentBatch.js) holds answers, synopses and each
// book's Why line, saved as its reading notes (works.reading_notes, shown on
// the book page). --notes-only saves the Why lines and nothing else, from a
// notes file (title, work id and Why line per book): for backfilling notes
// without touching answers the owner may have changed since. An older
// .json file is a list of answers only:
//   { "work_id": "…", "question": "pace", "answer": "steady", "sure": true,
//     "set_by": "claude", "note": "…" (optional), "title": "…" (for reading only) }
//
// Everything is checked before signing in; one problem stops the run with
// nothing saved. Claude's answers and synopses never replace the owner's (the
// database refuses that for answers too). It shows what it would save and asks
// before saving.

import { readFile } from 'node:fs/promises'
import { EVERY_QUESTION_ANSWERS, QUESTIONS } from '../src/assessments.js'
import { parseReview, planNotes, planSynopses } from '../src/assessmentBatch.js'
import { BOOK_TABLES, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'

const args = process.argv.slice(2)
const notesOnly = args.includes('--notes-only')
const file = args.find((a) => !a.startsWith('--'))
if (!file) throw new Error('Name the file: npm run assessments:save -- data/assessments/<file>.md')
if (notesOnly && !file.endsWith('.md')) throw new Error('--notes-only reads a .md notes file.')
const text = await readFile(file, 'utf8')
let answers = []
let synopses = []
let notes = []
if (file.endsWith('.md')) {
  const review = parseReview(text, { notesOnly })
  if (review.problems.length) {
    throw new Error(`The file has ${review.problems.length} problems. Nothing was saved.\n  ${review.problems.join('\n  ')}`)
  }
  ;({ answers, synopses, notes } = review)
} else answers = JSON.parse(text)

// --- Check the file before anything else
const problems = []
const seen = new Set()
for (const [i, row] of answers.entries()) {
  const where = `#${i + 1} (${row.title ?? row.work_id})`
  const question = QUESTIONS.find((q) => q.id === row.question)
  if (!/^[0-9a-f-]{36}$/.test(row.work_id ?? '')) problems.push(`${where}: no work id`)
  if (!question) problems.push(`${where}: no question "${row.question}"`)
  else if (![...question.answers, ...EVERY_QUESTION_ANSWERS].includes(row.answer)) {
    problems.push(`${where}: "${row.answer}" isn't an answer to ${row.question}`)
  }
  if (typeof row.sure !== 'boolean') problems.push(`${where}: sure must be true or false`)
  if (!['claude', 'owner'].includes(row.set_by)) problems.push(`${where}: set_by must be claude or owner`)
  const key = `${row.work_id}|${row.question}`
  if (seen.has(key)) problems.push(`${where}: ${row.question} is answered twice`)
  seen.add(key)
}
if (problems.length) {
  throw new Error(`The file has ${problems.length} problems. Nothing was saved.\n  ${problems.join('\n  ')}`)
}
console.log(
  notesOnly
    ? `${file}: ${notes.length} reading notes, all valid (notes only: answers and synopses are left as they are).\n`
    : `${file}: ${answers.length} answers${file.endsWith('.md') ? `, ${synopses.length} synopses and ${notes.length} reading notes` : ''}, all valid.\n`,
)

// --- Compare with what's saved
const { supabase, libraryId } = await signIn()
const table = (name) => BOOK_TABLES.find((t) => t.name === name)
const works = new Map((await fetchTable(supabase, table('works'), libraryId)).map((w) => [w.id, w]))
const saved = await fetchTable(supabase, table('assessments'), libraryId).catch((error) => {
  throw new Error(`${error.message}\nRun supabase/migrations/20261120_01_assessments.sql first. Nothing was saved.`)
})
const savedByKey = new Map(saved.map((r) => [`${r.work_id}|${r.question}`, r]))

const toSave = []
const counts = { added: 0, changed: 0, same: 0 }
const keptOwners = []
const missingWorks = []
for (const row of answers) {
  if (!works.has(row.work_id)) {
    missingWorks.push(row.title ?? row.work_id)
    continue
  }
  const now = savedByKey.get(`${row.work_id}|${row.question}`)
  const wanted = { library_id: libraryId, work_id: row.work_id, question: row.question, answer: row.answer, sure: row.sure, set_by: row.set_by, note: row.note ?? null }
  if (now?.set_by === 'owner' && row.set_by === 'claude') {
    if (now.answer !== row.answer) keptOwners.push(`${works.get(row.work_id).title}: ${row.question} stays ${now.answer} (not ${row.answer})`)
    continue
  }
  if (now && ['answer', 'sure', 'set_by', 'note'].every((c) => now[c] === wanted[c])) {
    counts.same++
    continue
  }
  counts[now ? 'changed' : 'added']++
  toSave.push(wanted)
}

const synopsisPlan = planSynopses(synopses, works)
missingWorks.push(...synopsisPlan.missing)
const notesPlan = planNotes(notes, works)
missingWorks.push(...notesPlan.missing)

if (!notesOnly) console.log(`\nSaving would add ${counts.added} answers and change ${counts.changed}; ${counts.same} are already saved as they are.`)
if (synopses.length) console.log(`Synopses: ${synopsisPlan.save.length} to save; ${synopsisPlan.same} already saved as they are.`)
if (notes.length) {
  const replacing = notesPlan.save.filter((n) => works.get(n.work_id).reading_notes).length
  console.log(`Reading notes: ${notesPlan.save.length} to save (${replacing} replacing older ones); ${notesPlan.same} already saved as they are.`)
}
if (keptOwners.length) console.log(`\nYour answers kept, where Claude's differ (${keptOwners.length}):\n  ${keptOwners.join('\n  ')}`)
if (synopsisPlan.keptOwners.length) console.log(`\nYour synopses kept, where Claude's differ (${synopsisPlan.keptOwners.length}):\n  ${synopsisPlan.keptOwners.join('\n  ')}`)
if (missingWorks.length) console.log(`\nBooks no longer in the catalog, skipped (${missingWorks.length}):\n  ${[...new Set(missingWorks)].join('\n  ')}`)
if (!toSave.length && !synopsisPlan.save.length && !notesPlan.save.length) {
  console.log('\nNothing to save.')
  process.exit(0)
}
if ((await ask('\nType SAVE to save them (anything else stops): ')).trim() !== 'SAVE') {
  console.log('Stopped. Nothing was saved.')
  process.exit(0)
}

for (let i = 0; i < toSave.length; i += 200) {
  const { error } = await supabase.from('assessments').upsert(toSave.slice(i, i + 200), { onConflict: 'work_id,question' })
  if (error) throw new Error(`Saving answers: ${error.message} (${i} of ${toSave.length} were saved; running again finishes the job)`)
}

for (const [i, s] of synopsisPlan.save.entries()) {
  const { error } = await supabase.from('works').update({ synopsis: s.synopsis, synopsis_set_by: s.set_by }).eq('id', s.work_id)
  if (error) throw new Error(`Saving the synopsis of ${s.title}: ${error.message} (${i} of ${synopsisPlan.save.length} synopses were saved; running again finishes the job)`)
}

for (const [i, n] of notesPlan.save.entries()) {
  const { error } = await supabase.from('works').update({ reading_notes: n.notes }).eq('id', n.work_id)
  if (error) {
    const hint = /reading_notes/.test(error.message) ? '\nRun supabase/migrations/20261123_01_reading_notes.sql first.' : ''
    throw new Error(`Saving the reading notes of ${n.title}: ${error.message} (${i} of ${notesPlan.save.length} notes were saved; running again finishes the job)${hint}`)
  }
}

// --- Read back and check
const after = new Map((await fetchTable(supabase, table('assessments'), libraryId)).map((r) => [`${r.work_id}|${r.question}`, r]))
const wrong = toSave.filter((w) => after.get(`${w.work_id}|${w.question}`)?.answer !== w.answer)
if (wrong.length) throw new Error(`${wrong.length} answers didn't save as expected. Running again may finish the job.`)
const worksAfter = new Map((await fetchTable(supabase, table('works'), libraryId)).map((w) => [w.id, w]))
const wrongSynopses = synopsisPlan.save.filter((s) => worksAfter.get(s.work_id)?.synopsis !== s.synopsis)
if (wrongSynopses.length) throw new Error(`${wrongSynopses.length} synopses didn't save as expected. Running again may finish the job.`)
const wrongNotes = notesPlan.save.filter((n) => worksAfter.get(n.work_id)?.reading_notes !== n.notes)
if (wrongNotes.length) throw new Error(`${wrongNotes.length} reading notes didn't save as expected. Running again may finish the job.`)
const books = new Set([...after.values()].map((r) => r.work_id)).size
const withSynopsis = [...worksAfter.values()].filter((w) => w.synopsis).length
const withNotes = [...worksAfter.values()].filter((w) => w.reading_notes).length
console.log(`\nSaved and checked. The library now has ${after.size} answers for ${books} books, ${withSynopsis} synopses and ${withNotes} reading notes.`)
