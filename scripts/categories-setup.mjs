// Loads the category list into the database and saves the owner's manual choices.
// Safe to rerun: it adds only what's missing, and never renames or deletes a
// category or replaces a choice the owner already made.
//
//   npm run categories:setup

import { MAIN_CATEGORIES, SUBCATEGORY_RULES } from '../src/categories/category-rules.js'
import { MANUAL_CHOICES, rowsForChoice } from '../src/categories/manual-choices.js'
import { fetchAll, signIn } from './lib/session.mjs'

const { supabase, libraryId } = await signIn()
const checked = async (query, doing) => {
  const { data, error } = await query
  if (error) throw new Error(`${doing}: ${error.message}`)
  return data
}

// --- The list -------------------------------------------------------------

const existing = await fetchAll(supabase, 'categories', 'id, name, parent_id', libraryId)
const mainIds = new Map(existing.filter((c) => !c.parent_id).map((c) => [c.name, c.id]))
let added = 0

for (const [position, name] of MAIN_CATEGORIES.entries()) {
  if (mainIds.has(name)) continue
  const [row] = await checked(
    supabase.from('categories').insert({ library_id: libraryId, name, position }).select('id'),
    `Adding ${name}`,
  )
  mainIds.set(name, row.id)
  added++
}

const subKey = (parentId, name) => `${parentId}|${name}`
const subIds = new Map(existing.filter((c) => c.parent_id).map((c) => [subKey(c.parent_id, c.name), c.id]))
for (const [main, rules] of Object.entries(SUBCATEGORY_RULES)) {
  for (const [position, { sub }] of rules.entries()) {
    const parent_id = mainIds.get(main)
    if (subIds.has(subKey(parent_id, sub))) continue
    const [row] = await checked(
      supabase.from('categories').insert({ library_id: libraryId, name: sub, parent_id, position }).select('id'),
      `Adding ${sub}`,
    )
    subIds.set(subKey(parent_id, sub), row.id)
    added++
  }
}
console.log(`Categories: ${added} added, ${existing.length} already there.`)

// --- The owner's choices ----------------------------------------------------

const idOf = (main, sub) => {
  const id = sub ? subIds.get(subKey(mainIds.get(main), sub)) : mainIds.get(main)
  if (!id) throw new Error(`No category called ${sub ? `${main} > ${sub}` : main}`)
  return id
}
const shelved = await fetchAll(supabase, 'book_categories', 'copy_id, category_id, set_by', libraryId, ['copy_id', 'category_id'])
const owned = new Set(shelved.filter((r) => r.set_by === 'owner').map((r) => r.copy_id))
const copies = await fetchAll(supabase, 'copies', 'id, title', libraryId)
const titles = new Map(copies.map((c) => [c.id, c.title]))

// Check every choice first, so a mistake stops the run before anything is saved.
const rows = new Map(MANUAL_CHOICES.map((choice) => {
  if (titles.get(choice.copyId) !== choice.title) {
    throw new Error(`Choice for "${choice.title}" doesn't match the catalog (found "${titles.get(choice.copyId)}"). Nothing was saved.`)
  }
  return [choice, rowsForChoice(choice, libraryId, idOf)]
}))

let saved = 0
for (const [choice, choiceRows] of rows) {
  if (owned.has(choice.copyId)) continue
  // A choice with a main shelf replaces the vote's result; "also in" alone adds to it.
  if (choice.main) await checked(supabase.from('book_categories').delete().eq('copy_id', choice.copyId).eq('set_by', 'vote'), `Clearing ${choice.title}`)
  await checked(supabase.from('book_categories').insert(choiceRows), `Saving ${choice.title}`)
  const shelves = [choice.main && `${choice.main} ${choice.subs?.join(', ') ?? ''}`, ...(choice.also ?? []).map((a) => `also ${a.main} ${a.subs?.join(', ') ?? ''}`)]
  console.log(`Saved: ${choice.title} → ${shelves.filter(Boolean).map((t) => t.trim()).join('; ')}`)
  saved++
}
console.log(`Manual choices: ${saved} saved, ${MANUAL_CHOICES.length - saved} already there.`)
