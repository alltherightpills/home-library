import { answerForm, planAnswerEdits } from './assessments.js'
import { nameForms, nameParts } from './authors.js'
import { planShelfDecision, planShelfEdit, shelfChoices } from './categories/review.js'
import {
  acquiredYearProblem,
  cleanIsbn,
  editionYearProblem,
  firstProblem,
  firstPublishedProblem,
  isbnProblem,
  pagesProblem,
  peopleProblem,
  publisherSeriesProblem,
  seriesProblem,
  titleProblem,
} from './formChecks.js'
import { duplicatePerson, formPeople, planPeople } from './peopleEdits.js'
import { supabase } from './supabase.js'
import { SHELF_COLUMNS } from './useCatalog.js'

// The name rules live in authors.js, shared with Manage › Authors.
export { nameParts }

// A book with no labels yet gets one blank row to fill in.
const labelRows = (labels) => (labels.length ? labels.map(({ name, number }) => ({ name, number })) : [{ name: '', number: '' }])

// The form's starting values. Everything is text, as typed in a field.
export function formFromCopy(copy, categories) {
  const text = (value) => (value === null || value === undefined ? '' : String(value))
  // A book with no one credited yet gets one blank Author row to fill in.
  const people = copy.people.length ? formPeople(copy.people) : [blankPerson()]
  return {
    title: copy.title,
    people,
    firstPublished: text(copy.work?.first_published_year),
    pages: text(copy.pages),
    publisher: text(copy.publisher),
    editionYear: text(copy.edition_year),
    binding: text(copy.binding),
    languages: copy.languages.join(', '),
    isbn13: text(copy.isbn13),
    isbn10: text(copy.isbn10),
    acquiredYear: text(copy.acquired_year),
    city: text(copy.acquired_city),
    region: text(copy.acquired_region),
    country: text(copy.acquired_country),
    series: labelRows(copy.series),
    publisherSeries: labelRows(copy.publisherSeries),
    editionNote: text(copy.edition_note),
    notes: text(copy.notes),
    synopsis: text(copy.work?.synopsis),
    judged: answerForm(copy.work?.assessments),
    needsReview: copy.needs_review,
    reviewNote: text(copy.review_note),
    audience: text(copy.audience),
    location: copy.location ?? 'Home',
    shelves: shelfChoices(copy, categories),
  }
}

// What's wrong with the form, in plain words, or '' if it can be saved. Older
// records may hold odd edition years and ISBNs, so those are checked once changed.
export function formProblem(form, copy) {
  return firstProblem(
    titleProblem(form.title),
    peopleProblem(form.people, (i) => Boolean(form.people[i].saved)),
    duplicatePerson(form.people),
    firstPublishedProblem(form.firstPublished),
    pagesProblem(form.pages),
    editionYearProblem(form.editionYear, copy.edition_year),
    isbnProblem(form.isbn13, copy.isbn13, 13),
    isbnProblem(form.isbn10, copy.isbn10, 10),
    seriesProblem(form.series),
    publisherSeriesProblem(form.publisherSeries),
    acquiredYearProblem(form.acquiredYear),
  )
}

const textOrNull = (value) => value.trim() || null
const numberOrNull = (value) => (value.trim() ? Number(value.trim()) : null)

// Only the values that differ, so an untouched field is never rewritten.
function differences(wanted, current) {
  return Object.fromEntries(Object.entries(wanted).filter(([key, value]) => value !== (current[key] ?? null)))
}

function check(error, what) {
  if (!error) return
  if (error.code === '23505') throw new Error(`That person is already listed on this book with the same role.`)
  throw new Error(`${what}: ${error.message}`)
}

// Find the person with this exact name, or add them.
export async function findOrAddAuthor(libraryId, last, first) {
  const forms = nameForms(last, first)
  const { data: found, error } = await supabase
    .from('authors')
    .select('id, sort_name, display_name')
    .eq('library_id', libraryId)
    .eq('sort_name', forms.sort_name)
    .maybeSingle()
  check(error, 'Looking up the author')
  if (found) return found
  const { data: added, error: addError } = await supabase
    .from('authors')
    .insert({ library_id: libraryId, ...forms })
    .select('id, sort_name, display_name')
    .single()
  check(addError, 'Adding the author')
  return added
}

// Manage › Authors: a new name for this person on every book. Books point at
// the person, so one saved row changes them all. `forms` comes from nameForms.
export async function renameAuthor(authorId, forms) {
  const { data, error } = await supabase
    .from('authors')
    .update(forms)
    .eq('id', authorId)
    .select('id, sort_name, display_name')
    .single()
  if (error?.code === '23505') throw new Error(`Someone named ${forms.sort_name} is already in the catalog.`)
  if (error) throw new Error(`Renaming: ${error.message}`)
  return data
}

// Manage › Authors: `dropIds` become `keepId` on every book, then are removed,
// all in one database step (supabase/migrations/20261107_01_merge_authors.sql).
export async function mergeAuthorsInto(keepId, dropIds) {
  const { error } = await supabase.rpc('merge_authors', { keep_id: keepId, drop_ids: dropIds })
  if (error?.code === 'PGRST202') throw new Error('Merging needs the database change from 2026-11-07 run first.')
  if (error) throw new Error(`Merging: ${error.message}`)
}

// Possible duplicates: pairs the owner checked and found different, as pairKeys.
export async function loadNotSame() {
  const { data, error } = await supabase.from('authors_not_same').select('author_a, author_b')
  if (error) throw new Error(`Reading checked pairs: ${error.message}`)
  return data.map((r) => `${r.author_a}|${r.author_b}`)
}

// `pairs` are [a, b] with the smaller id first (pairOf).
export async function markNotSame(libraryId, pairs) {
  if (!pairs.length) return
  const rows = pairs.map(([author_a, author_b]) => ({ library_id: libraryId, author_a, author_b }))
  const { error } = await supabase.from('authors_not_same').upsert(rows, { onConflict: 'author_a,author_b', ignoreDuplicates: true })
  if (error) throw new Error(`Saving "not the same": ${error.message}`)
}

// An author with no books left would inflate the author count, so remove them.
// If this fails the edit still stands; the extra author is harmless for now.
export async function removeAuthorIfUnused(authorId) {
  const { count, error } = await supabase
    .from('work_authors')
    .select('author_id', { count: 'exact', head: true })
    .eq('author_id', authorId)
  if (!error && count === 0) await supabase.from('authors').delete().eq('id', authorId)
}

// A name is corrected for this work only: other books by the old name are left
// alone. Renaming a person everywhere belongs to Manage › Authors (Phase 2).
// Each change is shown as soon as it's saved, so a failure partway leaves the
// screen matching the database and Save can simply be tapped again.
//
// Removed people go first (freeing their place), then changed names and roles,
// then new people, added after the others.
async function saveAuthors(copy, form, onWork) {
  const { remove, change, add } = planPeople(copy.people, form.people)
  let contributors = copy.work.contributors
  const same = (p, { authorId, role }) => p.author.id === authorId && p.role === role
  const show = () => onWork(copy.work.id, { contributors })

  for (const credit of remove) {
    const { error } = await supabase.from('work_authors').delete().match({ work_id: copy.work.id, author_id: credit.authorId, role: credit.role })
    check(error, 'Removing the person')
    await removeAuthorIfUnused(credit.authorId)
    contributors = contributors.filter((p) => !same(p, credit))
    show()
  }

  for (const { saved, last, first, role, renamed } of change) {
    const current = contributors.find((p) => same(p, saved)).author
    const author = renamed ? await findOrAddAuthor(copy.library_id, last, first) : current
    const { error } = await supabase
      .from('work_authors')
      .update({ author_id: author.id, role })
      .match({ work_id: copy.work.id, author_id: saved.authorId, role: saved.role })
    check(error, 'Changing the person')
    if (renamed) await removeAuthorIfUnused(saved.authorId)
    contributors = contributors.map((p) => (same(p, saved) ? { ...p, author, role } : p))
    show()
  }

  for (const { last, first, role, position } of add) {
    const author = await findOrAddAuthor(copy.library_id, last, first)
    const link = { library_id: copy.library_id, work_id: copy.work.id, author_id: author.id, role, position }
    const { error } = await supabase.from('work_authors').insert(link)
    check(error, 'Adding the person')
    contributors = [...contributors, { role, position, author }]
    show()
  }
}

// Pick for me's judged answers (plan in assessments.js). Each change is shown
// once saved, so after a failure partway Save can simply be tapped again.
async function saveAnswers(copy, judged, onWork) {
  if (!copy.work) return
  const { save, clear } = planAnswerEdits(copy.work.assessments, judged)
  let rows = copy.work.assessments ?? []
  if (save.length) {
    const toSave = save.map((a) => ({ library_id: copy.library_id, work_id: copy.work.id, note: null, ...a }))
    const { error } = await supabase.from('assessments').upsert(toSave, { onConflict: 'work_id,question' })
    check(error, 'Saving the Pick for me answers')
    const saved = new Set(save.map((a) => a.question))
    rows = [...rows.filter((r) => !saved.has(r.question)), ...save]
    onWork(copy.work.id, { assessments: rows })
  }
  if (clear.length) {
    const { error } = await supabase.from('assessments').delete().eq('work_id', copy.work.id).in('question', clear)
    check(error, 'Clearing the Pick for me answers')
    rows = rows.filter((r) => !clear.includes(r.question))
    onWork(copy.work.id, { assessments: rows })
  }
}

export const blankPerson = () => ({ last: '', first: '', role: 'Author', saved: null })

const SERIES = { list: 'series', links: 'copy_series', idColumn: 'series_id', onCopy: 'series_links', shown: 'series' }
const PUBLISHER_SERIES = {
  list: 'publisher_series',
  links: 'copy_publisher_series',
  idColumn: 'publisher_series_id',
  onCopy: 'publisher_series_links',
  shown: 'publisherSeries',
}

const sameLabelName = (a, b) => a.toLowerCase() === b.toLowerCase()

// A list entry with no books left would clutter the list, unless it holds spellings worth keeping.
async function removeLabelIfUnused(kind, label) {
  if (label.aliases.length) return
  const { count, error } = await supabase
    .from(kind.links)
    .select('copy_id', { count: 'exact', head: true })
    .eq(kind.idColumn, label.id)
  if (!error && count === 0) await supabase.from(kind.list).delete().eq('id', label.id)
}

// Makes this copy's labels match the form. A typed name that matches a list entry
// or one of its aliases uses that entry, so spellings don't split a series.
async function saveLabels(copy, rows, kind, onCopy) {
  const wanted = rows.map((r) => ({ name: r.name.trim(), number: r.number.trim() })).filter((r) => r.name)
  const current = copy[kind.shown]
  if (JSON.stringify(wanted) === JSON.stringify(current.map(({ name, number }) => ({ name, number })))) return

  const { data: list, error } = await supabase.from(kind.list).select('id, name, aliases').eq('library_id', copy.library_id)
  check(error, 'Reading the series list')

  const links = new Map() // by entry, so a name typed twice is one label
  for (const row of wanted) {
    let label = list.find((l) => sameLabelName(l.name, row.name) || l.aliases.some((a) => sameLabelName(a, row.name)))
    if (!label) {
      const { data: added, error: addError } = await supabase
        .from(kind.list)
        .insert({ library_id: copy.library_id, name: row.name })
        .select('id, name, aliases')
        .single()
      check(addError, 'Adding to the series list')
      list.push(added)
      label = added
    }
    links.set(label.id, { number: row.number || null, position: links.size, label })
  }

  if (links.size) {
    const rowsToSave = [...links].map(([id, { number, position }]) => ({
      library_id: copy.library_id,
      copy_id: copy.id,
      [kind.idColumn]: id,
      number,
      position,
    }))
    const { error: saveError } = await supabase.from(kind.links).upsert(rowsToSave)
    check(saveError, 'Saving the series')
  }
  const dropped = current.filter((label) => !links.has(label.id))
  if (dropped.length) {
    const { error: dropError } = await supabase
      .from(kind.links)
      .delete()
      .eq('copy_id', copy.id)
      .in(kind.idColumn, dropped.map((label) => label.id))
    check(dropError, 'Removing the series')
  }
  onCopy(copy.id, { [kind.onCopy]: [...links.values()] })
  for (const label of dropped) await removeLabelIfUnused(kind, label)
}

// A new copy's series and publisher's series, from form rows like Edit a Book's.
export async function saveNewCopyLabels(copy, form, onCopy) {
  await saveLabels(copy, form.series, SERIES, onCopy)
  await saveLabels(copy, form.publisherSeries, PUBLISHER_SERIES, onCopy)
}

// Saves what changed. `sharedWork` means another copy belongs to the same work.
export async function saveBookEdits(copy, form, sharedWork, categories, { onCopy, onWork }) {
  const title = form.title.trim()

  const copyChanges = differences(
    {
      title,
      pages: numberOrNull(form.pages),
      publisher: textOrNull(form.publisher),
      edition_year: numberOrNull(form.editionYear),
      binding: form.binding || null,
      edition_note: textOrNull(form.editionNote),
      notes: textOrNull(form.notes),
      isbn13: cleanIsbn(form.isbn13),
      isbn10: cleanIsbn(form.isbn10),
      acquired_year: numberOrNull(form.acquiredYear),
      acquired_city: textOrNull(form.city),
      acquired_region: textOrNull(form.region),
      acquired_country: textOrNull(form.country),
      location: form.location,
      needs_review: form.needsReview,
      // Turning the flag off clears its note, so an old note can't reappear.
      review_note: form.needsReview ? textOrNull(form.reviewNote) : null,
    },
    copy,
  )
  // The vote leaves an audience alone once it's the owner's.
  if (form.audience && form.audience !== copy.audience) {
    copyChanges.audience = form.audience
    copyChanges.audience_set_by = 'owner'
  }
  const languages = form.languages.split(',').map((l) => l.trim()).filter(Boolean)
  if (languages.join() !== copy.languages.join()) copyChanges.languages = languages
  if (Object.keys(copyChanges).length) {
    const { error } = await supabase.from('copies').update(copyChanges).eq('id', copy.id)
    check(error, 'Saving the book')
    onCopy(copy.id, copyChanges)
  }

  // First published belongs to the work, so every copy of it shows the new year.
  const workChanges = differences({ first_published_year: numberOrNull(form.firstPublished), synopsis: textOrNull(form.synopsis) }, copy.work)
  // A blank source is what the book page shows as "entered by hand".
  if ('first_published_year' in workChanges) workChanges.first_published_source = null
  // A synopsis changed here becomes the owner's, which an assessment pass leaves alone.
  if ('synopsis' in workChanges) workChanges.synopsis_set_by = workChanges.synopsis ? 'owner' : null
  // With only one copy, the work's title is this book's title. A second copy
  // may have a different title, so the shared one stays as it is.
  if (!sharedWork && copy.work.title === copy.title && title !== copy.title) workChanges.title = title
  if (Object.keys(workChanges).length) {
    const { error } = await supabase.from('works').update(workChanges).eq('id', copy.work.id)
    check(error, 'Saving the work')
    onWork(copy.work.id, workChanges)
  }

  await saveAuthors(copy, form, onWork)
  await saveAnswers(copy, form.judged, onWork)
  await saveLabels(copy, form.series, SERIES, onCopy)
  await saveLabels(copy, form.publisherSeries, PUBLISHER_SERIES, onCopy)

  const shelfPlan = planShelfEdit(copy, categories, form.shelves)
  await saveShelves(copy, shelfPlan, shelfPlan.decided, onCopy)
}

// Writes a plan from categories/review.js. Reads the shelves back either way, so
// after a failure partway the screen matches the database and Save can simply be
// tapped again.
async function saveShelves(copy, { demote, rows, remove = [] }, clearReview, onCopy) {
  try {
    if (demote) {
      const { error } = await supabase
        .from('book_categories')
        .update({ is_main: false, removed: true, set_by: 'owner' })
        .match({ copy_id: copy.id, category_id: demote })
      check(error, 'Changing the main category')
    }
    if (rows.length) {
      const { error } = await supabase.from('book_categories').upsert(rows)
      check(error, 'Saving the categories')
    }
    if (remove.length) {
      const { error } = await supabase.from('book_categories').delete().eq('copy_id', copy.id).in('category_id', remove)
      check(error, 'Removing a category')
    }
    if (clearReview && copy.category_review) {
      const { error } = await supabase.from('copies').update({ category_review: null }).eq('id', copy.id)
      check(error, 'Taking the book off the review list')
      onCopy(copy.id, { category_review: null })
    }
  } finally {
    const { data } = await supabase.from('book_categories').select(SHELF_COLUMNS).eq('copy_id', copy.id)
    if (data) onCopy(copy.id, { shelves: data })
  }
}

// Saves the Categories choices for a just-added book, as Edit a Book would.
// `decide` makes the shelves the owner's even if nothing changed.
export function saveShelfEdit(copy, categories, shelves, decide, onCopy) {
  const plan = planShelfEdit(copy, categories, shelves, { decide })
  return saveShelves(copy, plan, plan.decided, onCopy)
}

// Saves the owner's decision from the review list, which takes the book off the list.
export function saveShelfDecision(copy, categories, mainId, subIds, onCopy) {
  return saveShelves(copy, planShelfDecision(copy, categories, mainId, subIds), true, onCopy)
}

// Deletes this copy, plus anything only it was using: a photo of its cover, and
// its work and authors if no other copy needs them. Throws only if the copy stays.
export async function removeBook(copy) {
  const { data, error } = await supabase.from('copies').delete().eq('id', copy.id).select('id')
  check(error, 'Removing the book')
  if (!data.length) throw new Error('Removing the book: nothing was removed.')

  const photo = copy.cover_source === 'photo' && copy.cover_url?.split('/object/public/covers/')[1]
  if (photo) await supabase.storage.from('covers').remove([photo])

  for (const label of copy.series) await removeLabelIfUnused(SERIES, label)
  for (const label of copy.publisherSeries) await removeLabelIfUnused(PUBLISHER_SERIES, label)

  const { count, error: countError } = await supabase
    .from('copies')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', copy.work.id)
  if (countError || count !== 0) return
  const { error: workError } = await supabase.from('works').delete().eq('id', copy.work.id)
  if (workError) return
  for (const person of copy.people) await removeAuthorIfUnused(person.author.id)
}
