import { planShelfDecision, planShelfEdit, shelfChoices } from './categories/review.js'
import { toIsbn, toIsbn10 } from './isbn.js'
import { supabase } from './supabase.js'
import { SHELF_COLUMNS } from './useCatalog.js'

// "Joyce, James" → { last: 'Joyce', first: 'James' }; "Homer" has only a last name.
export function nameParts(sortName) {
  const comma = sortName.indexOf(',')
  if (comma === -1) return { last: sortName, first: '' }
  return { last: sortName.slice(0, comma).trim(), first: sortName.slice(comma + 1).trim() }
}

// A book with no labels yet gets one blank row to fill in.
const labelRows = (labels) => (labels.length ? labels.map(({ name, number }) => ({ name, number })) : [{ name: '', number: '' }])

// The form's starting values. Everything is text, as typed in a field.
export function formFromCopy(copy, categories) {
  const text = (value) => (value === null || value === undefined ? '' : String(value))
  // A book with no author yet gets one blank row to fill in.
  const people = copy.people.length
    ? copy.people.map((p) => ({ ...nameParts(p.author.sort_name), role: p.role }))
    : [{ last: '', first: '', role: 'Author' }]
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
    needsReview: copy.needs_review,
    reviewNote: text(copy.review_note),
    audience: text(copy.audience),
    shelves: shelfChoices(copy, categories),
  }
}

// "0-375-70539-2" → "0375705392", as ISBNs are stored. Removes everything but
// letters and digits, since text pasted from a website can hide odd hyphens and
// invisible characters. A stray letter stays, so the check can catch it.
const cleanIsbn = (value) => value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() || null

// What's wrong with the form, in plain words, or '' if it can be saved.
export function formProblem(form, copy) {
  if (!form.title.trim()) return 'A book needs a title.'
  for (const [i, person] of form.people.entries()) {
    if (person.last.trim()) continue
    if (person.first.trim() || copy.people[i]) return 'Each person needs a last name (or a single name, like Homer).'
  }
  // Ancient works can have a year before 0, stored as a negative number.
  if (form.firstPublished.trim() && !/^-?\d{1,4}$/.test(form.firstPublished.trim())) {
    return 'First published should be a year, like 1914.'
  }
  if (form.pages.trim() && !/^[1-9]\d{0,4}$/.test(form.pages.trim())) return 'Pages should be a whole number, like 224.'
  // Older records may hold odd values, so these are only checked once changed.
  const editionYear = form.editionYear.trim()
  if (editionYear && editionYear !== String(copy.edition_year) && !/^\d{4}$/.test(editionYear)) {
    return 'Edition year should be a four-digit year, like 2008.'
  }
  const isbn13 = cleanIsbn(form.isbn13)
  if (isbn13 && isbn13 !== copy.isbn13 && !toIsbn(isbn13)) {
    return "That ISBN-13 isn't valid. Check for a mistyped digit."
  }
  const isbn10 = cleanIsbn(form.isbn10)
  if (isbn10 && isbn10 !== copy.isbn10 && !toIsbn10(isbn10)) {
    return "That ISBN-10 isn't valid. Check for a mistyped digit."
  }
  if (form.series.some((s) => s.number.trim() && !s.name.trim())) return 'A series number needs a series name.'
  if (form.publisherSeries.some((s) => s.number.trim() && !s.name.trim())) {
    return "A publisher's series number needs a name."
  }
  const year = form.acquiredYear.trim()
  if (year && (!/^\d{4}$/.test(year) || Number(year) > new Date().getFullYear())) {
    return 'Year acquired should be a four-digit year, not in the future.'
  }
  return ''
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
  const sortName = first ? `${last}, ${first}` : last
  const { data: found, error } = await supabase
    .from('authors')
    .select('id, sort_name, display_name')
    .eq('library_id', libraryId)
    .eq('sort_name', sortName)
    .maybeSingle()
  check(error, 'Looking up the author')
  if (found) return found
  const { data: added, error: addError } = await supabase
    .from('authors')
    .insert({ library_id: libraryId, sort_name: sortName, display_name: first ? `${first} ${last}` : last })
    .select('id, sort_name, display_name')
    .single()
  check(addError, 'Adding the author')
  return added
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
async function saveAuthors(copy, form, onWork) {
  let contributors = copy.work.contributors
  for (const [i, person] of form.people.entries()) {
    const last = person.last.trim()
    const first = person.first.trim()
    const current = copy.people[i]
    if (!last) continue
    if (current) {
      const was = nameParts(current.author.sort_name)
      if (was.last === last && was.first === first) continue
    }

    const author = await findOrAddAuthor(copy.library_id, last, first)
    if (current) {
      const { error } = await supabase
        .from('work_authors')
        .update({ author_id: author.id })
        .match({ work_id: copy.work.id, author_id: current.author.id, role: current.role })
      check(error, 'Changing the author')
      await removeAuthorIfUnused(current.author.id)
      contributors = contributors.map((p) =>
        p.author.id === current.author.id && p.role === current.role ? { ...p, author } : p,
      )
    } else {
      const link = { library_id: copy.library_id, work_id: copy.work.id, author_id: author.id, role: person.role, position: i }
      const { error } = await supabase.from('work_authors').insert(link)
      check(error, 'Adding the author')
      contributors = [...contributors, { role: person.role, position: i, author }]
    }
    onWork(copy.work.id, { contributors })
  }
}

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
  const workChanges = differences({ first_published_year: numberOrNull(form.firstPublished) }, copy.work)
  // A blank source is what the book page shows as "entered by hand".
  if ('first_published_year' in workChanges) workChanges.first_published_source = null
  // With only one copy, the work's title is this book's title. A second copy
  // may have a different title, so the shared one stays as it is.
  if (!sharedWork && copy.work.title === copy.title && title !== copy.title) workChanges.title = title
  if (Object.keys(workChanges).length) {
    const { error } = await supabase.from('works').update(workChanges).eq('id', copy.work.id)
    check(error, 'Saving the work')
    onWork(copy.work.id, workChanges)
  }

  await saveAuthors(copy, form, onWork)
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
