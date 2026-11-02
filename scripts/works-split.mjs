// Gives a copy its own work, for two different books the import filed as one
// (each then shows the other under "You also own").
//
//   npm run works:split -- "<copy title>" ["<copy title>" …]            (shows the plan; saves nothing)
//   npm run works:split -- "<copy title>" ["<copy title>" …] --apply    (the same, then asks; needs a backup)
//
// The title is the copy's own, exactly as the book page shows it. The new work
// takes the copy's title, the old work's authors (same order and roles) and its
// original language; first published is left blank for `npm run enrich` to fill
// from the saved lookups. The other copies keep the old work.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'

const applying = process.argv.includes('--apply')
const titles = process.argv.slice(2).filter((a) => a !== '--apply')
if (!titles.length) {
  console.log('Name the copies to split off: npm run works:split -- "<copy title>"')
  process.exit(1)
}

const { supabase, libraryId } = await signIn()
const read = (name) => fetchTable(supabase, BOOK_TABLES.find((t) => t.name === name), libraryId)
const [copies, works, credits] = await Promise.all(['copies', 'works', 'work_authors'].map(read))
const workById = new Map(works.map((w) => [w.id, w]))

const plan = []
for (const title of titles) {
  const matches = copies.filter((c) => c.title === title)
  if (matches.length !== 1) {
    console.log(`"${title}": ${matches.length ? `${matches.length} copies have this title; can't tell which` : 'no copy has this title'}. Skipped.`)
    continue
  }
  const copy = matches[0]
  const others = copies.filter((c) => c.id !== copy.id && c.work_id === copy.work_id)
  if (!others.length) {
    console.log(`"${title}": already the only copy of its work. Nothing to do.`)
    continue
  }
  plan.push({ copy, work: workById.get(copy.work_id), others, credits: credits.filter((c) => c.work_id === copy.work_id) })
}

for (const { copy, work, others } of plan) {
  console.log(`\n"${copy.title}" gets its own work.`)
  console.log(`  Leaves work "${work.title}", which keeps: ${others.map((c) => `"${c.title}"`).join(', ')}`)
}
if (!plan.length) process.exit(0)
if (!applying) {
  console.log('\nNothing was saved. To save this, add --apply.')
  process.exit(0)
}

// The way back is a restore, so the newest backup must have these copies as they are now.
const snapshot = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort().at(-1)
if (!snapshot) throw new Error('No backup found. Run npm run backup first. Nothing was changed.')
const backedUp = new Map(JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, 'copies.json'), 'utf8')).map((c) => [c.id, c]))
if (plan.some(({ copy }) => backedUp.get(copy.id)?.work_id !== copy.work_id)) {
  throw new Error(`These copies have changed since backup ${snapshot}. Run npm run backup first. Nothing was changed.`)
}

const count = plan.length === 1 ? '1 copy' : `${plan.length} copies`
const answer = await ask(`\nThe way back is backup ${snapshot}. Type SPLIT to split off ${count}: `)
if (answer.trim() !== 'SPLIT') {
  console.log('Nothing was changed.')
  process.exit(0)
}

for (const { copy, work, credits: oldCredits } of plan) {
  const { data: newWork, error } = await supabase
    .from('works')
    .insert({ library_id: libraryId, title: copy.title, original_language: work.original_language })
    .select('id')
    .single()
  if (error) throw new Error(`Adding a work for "${copy.title}": ${error.message}`)
  try {
    const newCredits = oldCredits.map(({ author_id, role, position }) => ({ library_id: libraryId, work_id: newWork.id, author_id, role, position }))
    if (newCredits.length) {
      const { error: creditError } = await supabase.from('work_authors').insert(newCredits)
      if (creditError) throw new Error(`Adding the authors: ${creditError.message}`)
    }
    const { error: copyError } = await supabase.from('copies').update({ work_id: newWork.id }).eq('id', copy.id)
    if (copyError) throw new Error(`Moving the copy: ${copyError.message}`)
  } catch (err) {
    // Take the new work back (its authors go with it), so a rerun starts clean.
    await supabase.from('works').delete().eq('id', newWork.id)
    throw new Error(`"${copy.title}": ${err.message}. Nothing was changed for this book.`)
  }
  console.log(`"${copy.title}": done.`)
}

// Read back: each copy should be alone in a work with the same authors as before.
const [copiesNow, creditsNow] = await Promise.all(['copies', 'work_authors'].map(read))
const authorsOf = (list) => list.map((c) => `${c.author_id}|${c.role}|${c.position}`).sort().join()
const wrong = plan.filter(({ copy, work, credits: oldCredits }) => {
  const now = copiesNow.find((c) => c.id === copy.id)
  return (
    !now ||
    now.work_id === work.id ||
    copiesNow.some((c) => c.id !== copy.id && c.work_id === now.work_id) ||
    authorsOf(creditsNow.filter((c) => c.work_id === now.work_id)) !== authorsOf(oldCredits)
  )
})
if (wrong.length) throw new Error(`Didn't check out: ${wrong.map(({ copy }) => `"${copy.title}"`).join(', ')}`)
console.log(`\nSaved and checked: ${count} split off. Run npm run enrich to fill in their first-published years.`)
