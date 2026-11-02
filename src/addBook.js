// Scan to add: the check form's starting values, and saving a new book.
import { plain } from './bookLookups.js'
import { findOrAddAuthor, nameParts, removeAuthorIfUnused, saveNewCopyLabels, saveShelfEdit } from './bookEdits.js'
import { shelfChoices } from './categories/review.js'
import { googleMain, voteCategories } from './categories/vote.js'
import { categoryIds, voteReview, voteShelves } from './categories/voteResults.js'
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
// The category vote
// ---------------------------------------------------------------------------

const NO_MAIN = { flags: ['no main category'], suggestions: [] }

// The vote on a new book, judged as the backlog was: its own record is what LC
// and Open Library say about this edition, and the other sources are the
// lookups' answers. `title` and `originalTitle` are the form's starting ones.
// -> { result, shelves, review, audience, guess }; `problem` if the vote couldn't run.
export function voteOnNewBook(book, { title, originalTitle }, categories) {
  const copy = { title, original_title: originalTitle, subjects: [], lt_genres: [], ...book.catalog }
  try {
    const result = voteCategories(copy, book.answers)
    const idOf = categoryIds(categories)
    const shelves = voteShelves(result, idOf).map((s) => ({ ...s, removed: false }))
    return { result, shelves, review: voteReview(result), audience: result.audience, guess: mainGuess(result, book.answers, idOf) }
  } catch (err) {
    return { result: null, shelves: [], review: NO_MAIN, audience: 'Adult', problem: err.message }
  }
}

// With no main category from the rules, what the other sources suggest, to
// offer as one tap: { id, main, because }, or null. Tested on the backlog's
// books looked up as new: when LC's other editions and Google agree it matched
// the owner's main category 93% of the time; Google alone, 66%.
function mainGuess(result, answers, idOf) {
  if (result.main) return null
  const [lean] = result.leans
  if (lean) return { id: idOf(lean[0]), main: lean[0], because: "LC's other editions and Google agree" }
  const labels = answers.google?.volumeInfo?.categories ?? []
  const main = googleMain(labels)
  return main ? { id: idOf(main), main, because: `Google only, a weaker guess: "${labels[0]}"` } : null
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

const blankRow = { name: '', number: '' }

// The check form for one looked-up book. The title goes through the same cleanup
// as the catalog's titles did; series it finds move to their own fields.
// `others` are copies you own of another edition; the new copy joins their work
// unless that's unticked. Categories and audience start as the vote has them.
// -> { form, vote }
export function formFromLookup(book, acquired, others, knownSeries, categories) {
  const raw = book.subtitle ? `${book.title}: ${book.subtitle}` : book.title
  const clean = cleanTitle(raw, knownSeries)
  const series = clean.series.map((name, i) => ({ name, number: i === clean.series.length - 1 ? clean.number : '' }))
  // LC files names as "García Márquez, Gabriel", which splits better than the shown form.
  const names = book.authorSortNames?.length ? book.authorSortNames : book.authors
  const people = names.length ? names.map(splitName) : [{ last: '', first: '' }]
  const originalTitle = clean.changed ? raw : null
  const text = (value) => (value === null || value === undefined ? '' : String(value))
  const vote = voteOnNewBook(book, { title: clean.title, originalTitle }, categories)
  const form = {
    title: clean.title,
    originalTitle,
    people,
    series: series.length ? series : [blankRow],
    publisherSeries: clean.publisherSeries.length ? clean.publisherSeries.map(splitPublisherSeries) : [blankRow],
    editionNote: [...clean.editionNotes, book.editionNote].filter(Boolean).join('; '),
    // Shown only in Add by hand; a scanned book keeps what the lookup found.
    publisher: text(book.publisher),
    editionYear: text(book.year),
    // An odd value from a lookup (0 pages) is left out rather than blocking a save.
    pages: book.pages > 0 && book.pages < 100000 ? String(book.pages) : '',
    binding: text(book.binding),
    firstPublished: text(book.firstPublished),
    acquiredYear: acquired.year,
    city: acquired.city,
    region: acquired.region,
    country: acquired.country,
    workId: others[0]?.work?.id ?? '',
    shelves: shelfChoices({ shelves: vote.shelves }, categories),
    audience: vote.audience,
    looksRight: false,
  }
  return { form, vote }
}

// What's wrong with the form, in plain words, or '' if it can be saved.
export function addProblem(form) {
  if (!form.title.trim()) return 'A book needs a title.'
  if (!form.workId && form.people.some((p) => p.first.trim() && !p.last.trim())) {
    return 'Each person needs a last name (or a single name, like Homer).'
  }
  // Ancient works can have a year before 0, stored as a negative number.
  if (form.firstPublished.trim() && !/^-?\d{1,4}$/.test(form.firstPublished.trim())) {
    return 'First published should be a year, like 1914.'
  }
  if (form.editionYear.trim() && !/^\d{4}$/.test(form.editionYear.trim())) {
    return 'Edition year should be a four-digit year, like 2008.'
  }
  if (form.pages.trim() && !/^[1-9]\d{0,4}$/.test(form.pages.trim())) return 'Pages should be a whole number, like 224.'
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

// Saves a new copy: its work (or the other edition's), authors, series, and
// categories: the vote's shelves first, then the form's changes to them, saved
// as Edit a Book saves them. Returns { id, warning }; throws if nothing was kept.
export async function saveNewBook({ form, book, vote, categories, isbn13, libraryId, knownAuthorIds }) {
  const title = form.title.trim()
  const text = (value) => value.trim() || null
  const number = (value) => (value.trim() ? Number(value.trim()) : null)
  // A year typed over the lookup's is the owner's, which a blank source records.
  const firstYear = number(form.firstPublished)
  const firstSource = firstYear === book.firstPublished ? book.firstPublishedSource : null
  let workId = form.workId
  let newWorkId = null
  const people = []

  try {
    if (!workId) {
      for (const person of form.people) {
        if (person.last.trim()) people.push(await findOrAddAuthor(libraryId, person.last.trim(), person.first.trim()))
      }
      // The lookup has already left out a first-published year after this edition's.
      const { data: work, error } = await supabase
        .from('works')
        .insert({ library_id: libraryId, title, first_published_year: firstYear, first_published_source: firstSource })
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
        publisher: text(form.publisher),
        edition_year: number(form.editionYear),
        pages: number(form.pages),
        binding: form.binding || null,
        languages: book.languages,
        edition_note: text(form.editionNote),
        acquired_year: form.acquiredYear.trim() ? Number(form.acquiredYear.trim()) : null,
        acquired_city: text(form.city),
        acquired_region: text(form.region),
        acquired_country: text(form.country),
        ...book.cover,
        ...book.catalog,
        audience: form.audience,
        audience_set_by: form.audience === vote.audience ? 'vote' : 'owner',
        // Until its shelves are saved below, the book waits on the review list.
        category_review: NO_MAIN,
        added_on: today(),
      })
      .select('id')
      .single()
    check(error, 'Adding the book')

    // The book is saved; series or categories that fail to save are only warnings.
    const warnings = []
    await saveLookups(book.lookupsToSave, isbn13 ?? `copy:${copy.id}`, libraryId)
    try {
      await saveNewCopyLabels({ id: copy.id, library_id: libraryId, series: [], publisherSeries: [] }, form, () => {})
    } catch (err) {
      warnings.push(`The book was added, but not its series (${err.message}). Add it with Edit a Book.`)
    }
    try {
      await saveCategories(copy.id, libraryId, vote, categories, form)
    } catch (err) {
      warnings.push(`The book was added, but not all its categories (${err.message}). It's on Review categories to finish.`)
    }
    return { id: copy.id, warning: warnings.join(' ') }
  } catch (err) {
    // Take back what this save added, so trying again doesn't leave a stray work or person.
    if (newWorkId) await supabase.from('works').delete().eq('id', newWorkId)
    for (const author of people) if (!knownAuthorIds.has(author.id)) await removeAuthorIfUnused(author.id)
    throw err
  }
}

// The vote's shelves and review notes, then the owner's changes on the form.
// A failure partway leaves the book on the review list.
async function saveCategories(copyId, libraryId, vote, categories, form) {
  const rows = vote.shelves.map((s) => ({ ...s, library_id: libraryId, copy_id: copyId, set_by: 'vote' }))
  if (rows.length) check((await supabase.from('book_categories').insert(rows)).error, 'Saving the categories')
  if (vote.review !== NO_MAIN) {
    check((await supabase.from('copies').update({ category_review: vote.review }).eq('id', copyId)).error, 'Saving the review notes')
  }
  const voted = { id: copyId, library_id: libraryId, shelves: rows, category_review: vote.review }
  await saveShelfEdit(voted, categories, form.shelves, form.looksRight, () => {})
}

// Add by hand's answers, saved under the book's key (its ISBN, or copy:<id>
// for a book with none), so `npm run categories:save` sees what the vote saw.
// Not saving them is no reason to stop; `npm run enrich -- --votes` can ask again.
async function saveLookups(answers, key, libraryId) {
  const rows = Object.entries(answers ?? {}).map(([source, data]) => ({ library_id: libraryId, source, isbn: key, found: Boolean(data), data }))
  if (rows.length) await supabase.from('lookups').upsert(rows)
}
