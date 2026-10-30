import { supabase } from './supabase.js'

// "Joyce, James" → { last: 'Joyce', first: 'James' }; "Homer" has only a last name.
export function nameParts(sortName) {
  const comma = sortName.indexOf(',')
  if (comma === -1) return { last: sortName, first: '' }
  return { last: sortName.slice(0, comma).trim(), first: sortName.slice(comma + 1).trim() }
}

// The form's starting values. Everything is text, as typed in a field.
export function formFromCopy(copy) {
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
    acquiredYear: text(copy.acquired_year),
    city: text(copy.acquired_city),
    region: text(copy.acquired_region),
    country: text(copy.acquired_country),
  }
}

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
async function findOrAddAuthor(libraryId, last, first) {
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
async function removeAuthorIfUnused(authorId) {
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

// Saves what changed. `sharedWork` means another copy belongs to the same work.
export async function saveBookEdits(copy, form, sharedWork, { onCopy, onWork }) {
  const title = form.title.trim()

  const copyChanges = differences(
    {
      title,
      pages: numberOrNull(form.pages),
      acquired_year: numberOrNull(form.acquiredYear),
      acquired_city: textOrNull(form.city),
      acquired_region: textOrNull(form.region),
      acquired_country: textOrNull(form.country),
    },
    copy,
  )
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
}

// Deletes this copy, plus anything only it was using: a photo of its cover, and
// its work and authors if no other copy needs them. Throws only if the copy stays.
export async function removeBook(copy) {
  const { data, error } = await supabase.from('copies').delete().eq('id', copy.id).select('id')
  check(error, 'Removing the book')
  if (!data.length) throw new Error('Removing the book: nothing was removed.')

  const photo = copy.cover_source === 'photo' && copy.cover_url?.split('/object/public/covers/')[1]
  if (photo) await supabase.storage.from('covers').remove([photo])

  const { count, error: countError } = await supabase
    .from('copies')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', copy.work.id)
  if (countError || count !== 0) return
  const { error: workError } = await supabase.from('works').delete().eq('id', copy.work.id)
  if (workError) return
  for (const person of copy.people) await removeAuthorIfUnused(person.author.id)
}
