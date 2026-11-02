// Scan to add: the check form's starting values, and saving a new book.
import { plain } from './bookLookups.js'
import { findOrAddAuthor, nameParts, removeAuthorIfUnused, saveNewCopyLabels } from './bookEdits.js'
import { supabase } from './supabase.js'
import { cleanTitle, splitPublisherSeries } from './titles/cleanTitle.js'

// ---------------------------------------------------------------------------
// "New books saved as [year · place]": kept on the phone until changed.
// ---------------------------------------------------------------------------

const ACQUIRED_KEY = 'scan.acquired'

export function loadAcquired() {
  const blank = { year: String(new Date().getFullYear()), city: '', region: '', country: '' }
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(ACQUIRED_KEY)) }
  } catch {
    return blank
  }
}

export const saveAcquired = (acquired) => localStorage.setItem(ACQUIRED_KEY, JSON.stringify(acquired))

// "2026 · Decorah, Iowa, USA"
export const acquiredText = ({ year, city, region, country }) =>
  [year, [city, region, country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'nothing yet'

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Small words that belong with the last name: "Le Guin", "de la Mare", "van Gogh".
const PARTICLES = new Set(['de', 'la', 'le', 'du', 'da', 'di', 'del', 'della', 'des', 'van', 'von', 'der', 'den', 'ten', 'ter', 'st.', 'saint'])

// "Ursula K. Le Guin" -> { last: 'Le Guin', first: 'Ursula K.' }; "Homer" -> last only.
// A name already written "Last, First" is split at the comma.
export function splitName(name) {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (clean.includes(',')) return nameParts(clean)
  const words = clean.split(' ')
  let start = words.length - 1
  while (start > 1 && PARTICLES.has(words[start - 1].toLowerCase())) start--
  return { last: words.slice(start).join(' '), first: words.slice(0, start).join(' ') }
}

const surnameOf = (sortName) => plain(nameParts(sortName).last)

// Everyone in the catalog, once each.
export function authorsIn(copies) {
  const byId = new Map()
  for (const c of copies) for (const p of c.people) byId.set(p.author.id, p.author)
  return [...byId.values()]
}

// For a typed name: the person with exactly that name, if any, and others with
// the same last name ("You have Jones, Edward P. Same person?").
export function authorMatches(authors, { last, first }) {
  if (!last.trim()) return { exact: null, similar: [] }
  const sortName = first.trim() ? `${last.trim()}, ${first.trim()}` : last.trim()
  const exact = authors.find((a) => plain(a.sort_name) === plain(sortName)) ?? null
  const initial = plain(first).charAt(0)
  const typedLast = plain(last)
  const typedFull = plain(`${first} ${last}`)
  // The same last name; or one ending in it, or the same full name filed another
  // way, as when "Gabriel García Márquez" is split as Márquez, Gabriel García.
  const alike = (a) => {
    const surname = surnameOf(a.sort_name)
    return surname === typedLast || surname.endsWith(` ${typedLast}`) || plain(a.display_name ?? '') === typedFull
  }
  const similar = authors
    .filter((a) => a !== exact && alike(a))
    // Same first initial first, so "Edward P." comes before "Mary".
    .sort((a, b) => Number(plain(nameParts(b.sort_name).first).startsWith(initial)) - Number(plain(nameParts(a.sort_name).first).startsWith(initial)))
    .slice(0, 4)
  return { exact, similar }
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

const blankRow = { name: '', number: '' }

// The check form for one looked-up book. The title goes through the same cleanup
// as the catalog's titles did; series it finds move to their own fields.
// `others` are copies you own of another edition; the new copy joins their work
// unless that's unticked.
export function formFromLookup(book, acquired, others, knownSeries) {
  const raw = book.subtitle ? `${book.title}: ${book.subtitle}` : book.title
  const clean = cleanTitle(raw, knownSeries)
  const series = clean.series.map((name, i) => ({ name, number: i === clean.series.length - 1 ? clean.number : '' }))
  const people = book.authors.length ? book.authors.map(splitName) : [{ last: '', first: '' }]
  return {
    title: clean.title,
    originalTitle: clean.changed ? raw : null,
    people,
    series: series.length ? series : [blankRow],
    publisherSeries: clean.publisherSeries.length ? clean.publisherSeries.map(splitPublisherSeries) : [blankRow],
    editionNote: clean.editionNotes.join('; '),
    acquiredYear: acquired.year,
    city: acquired.city,
    region: acquired.region,
    country: acquired.country,
    workId: others[0]?.work?.id ?? '',
  }
}

// What's wrong with the form, in plain words, or '' if it can be saved.
export function addProblem(form) {
  if (!form.title.trim()) return 'A book needs a title.'
  if (!form.workId && form.people.some((p) => p.first.trim() && !p.last.trim())) {
    return 'Each person needs a last name (or a single name, like Homer).'
  }
  if ([...form.series, ...form.publisherSeries].some((s) => s.number.trim() && !s.name.trim())) {
    return 'A series number needs a series name.'
  }
  const year = form.acquiredYear.trim()
  if (year && (!/^\d{4}$/.test(year) || Number(year) > new Date().getFullYear())) {
    return 'Year acquired should be a four-digit year, not in the future.'
  }
  return ''
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// Today on the phone's calendar (the database's would be tomorrow on a late evening).
const today = () => new Date().toLocaleDateString('en-CA')

// Saves a new copy: its work (or the other edition's), authors, and series.
// Until the category vote comes to Scan to add, a new book goes on the review
// list with no main category. Returns { id, warning }; throws if nothing was kept.
export async function saveNewBook({ form, book, isbn13, libraryId, knownAuthorIds }) {
  const title = form.title.trim()
  const text = (value) => value.trim() || null
  let workId = form.workId
  let newWorkId = null
  const people = []

  try {
    if (!workId) {
      for (const person of form.people) {
        if (person.last.trim()) people.push(await findOrAddAuthor(libraryId, person.last.trim(), person.first.trim()))
      }
      // A first-published year after this edition's can't be right.
      const firstYear = book.firstPublished && (!book.year || book.firstPublished <= book.year) ? book.firstPublished : null
      const { data: work, error } = await supabase
        .from('works')
        .insert({
          library_id: libraryId,
          title,
          first_published_year: firstYear,
          first_published_source: firstYear ? 'Open Library' : null,
        })
        .select('id')
        .single()
      check(error, 'Adding the work')
      workId = newWorkId = work.id
      // The same person typed twice is listed once.
      const credits = [...new Map(people.map((a) => [a.id, a])).values()].map((author, position) => ({
        library_id: libraryId,
        work_id: workId,
        author_id: author.id,
        role: 'Author',
        position,
      }))
      if (credits.length) check((await supabase.from('work_authors').insert(credits)).error, 'Adding the authors')
    }

    const { data: copy, error } = await supabase
      .from('copies')
      .insert({
        library_id: libraryId,
        work_id: workId,
        title,
        original_title: form.originalTitle,
        isbn13,
        isbn10: book.isbn10 ?? null,
        publisher: book.publisher,
        edition_year: book.year,
        pages: book.pages,
        binding: book.binding,
        languages: book.languages,
        edition_note: text(form.editionNote),
        acquired_year: form.acquiredYear.trim() ? Number(form.acquiredYear.trim()) : null,
        acquired_city: text(form.city),
        acquired_region: text(form.region),
        acquired_country: text(form.country),
        ...book.cover,
        category_review: { flags: ['no main category'], suggestions: [] },
        added_on: today(),
      })
      .select('id')
      .single()
    check(error, 'Adding the book')

    // The book is saved; a series that fails to save is only a warning.
    try {
      await saveNewCopyLabels({ id: copy.id, library_id: libraryId, series: [], publisherSeries: [] }, form, () => {})
      return { id: copy.id, warning: '' }
    } catch (err) {
      return { id: copy.id, warning: `The book was added, but not its series (${err.message}). Add it with Edit a Book.` }
    }
  } catch (err) {
    // Take back what this save added, so trying again doesn't leave a stray work or person.
    if (newWorkId) await supabase.from('works').delete().eq('id', newWorkId)
    for (const author of people) if (!knownAuthorIds.has(author.id)) await removeAuthorIfUnused(author.id)
    throw err
  }
}
