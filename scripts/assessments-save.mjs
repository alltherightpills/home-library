// Saves a file of Pick for me's judged answers (src/assessments.js), and
// synopses, to the library. Claude writes the file in an assessment session;
// the owner runs this.
//
//   npm run assessments:save -- data/assessments/batch-01-2026-11-23.md
//   npm run assessments:save -- data/assessments/2026-11-20-examples-and-trial.json
//
// A batch's review file (.md, made by `npm run assessments:batch`, read by
// parseReview in src/assessmentBatch.js) holds answers and synopses. An older
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
import { parseReview, planSynopses } from '../src/assessmentBatch.js'
import { BOOK_TABLES, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'

const file = process.argv[2]
if (!file) throw new Error('Name the file: npm run assessments:save -- data/assessments/<file>.md')
const text = await readFile(file, 'utf8')
let answers = []
let synopses = []
if (file.endsWith('.md')) {
  const review = parseReview(text)
  if (review.problems.length) {
    throw new Error(`The file has ${review.problems.length} problems. Nothing was saved.\n  ${review.problems.join('\n  ')}`)
  }
  ;({ answers, synopses } = review)
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
console.log(`${file}: ${answers.length} answers${file.endsWith('.md') ? ` and ${synopses.length} synopses` : ''}, all valid.\n`)

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

console.log(`\nSaving would add ${counts.added} answers and change ${counts.changed}; ${counts.same} are already saved as they are.`)
if (synopses.length) console.log(`Synopses: ${synopsisPlan.save.length} to save; ${synopsisPlan.same} already saved as they are.`)
if (keptOwners.length) console.log(`\nYour answers kept, where Claude's differ (${keptOwners.length}):\n  ${keptOwners.join('\n  ')}`)
if (synopsisPlan.keptOwners.length) console.log(`\nYour synopses kept, where Claude's differ (${synopsisPlan.keptOwners.length}):\n  ${synopsisPlan.keptOwners.join('\n  ')}`)
if (missingWorks.length) console.log(`\nBooks no longer in the catalog, skipped (${missingWorks.length}):\n  ${[...new Set(missingWorks)].join('\n  ')}`)
if (!toSave.length && !synopsisPlan.save.length) {
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

// --- Read back and check
const after = new Map((await fetchTable(supabase, table('assessments'), libraryId)).map((r) => [`${r.work_id}|${r.question}`, r]))
const wrong = toSave.filter((w) => after.get(`${w.work_id}|${w.question}`)?.answer !== w.answer)
if (wrong.length) throw new Error(`${wrong.length} answers didn't save as expected. Running again may finish the job.`)
const worksAfter = new Map((await fetchTable(supabase, table('works'), libraryId)).map((w) => [w.id, w]))
const wrongSynopses = synopsisPlan.save.filter((s) => worksAfter.get(s.work_id)?.synopsis !== s.synopsis)
if (wrongSynopses.length) throw new Error(`${wrongSynopses.length} synopses didn't save as expected. Running again may finish the job.`)
const books = new Set([...after.values()].map((r) => r.work_id)).size
const withSynopsis = [...worksAfter.values()].filter((w) => w.synopsis).length
console.log(`\nSaved and checked. The library now has ${after.size} answers for ${books} books, and ${withSynopsis} synopses.`)
