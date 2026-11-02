// The spreadsheet export: one row per book, in words a person can read. Kept in
// src/ (no database or file access here) so the app's Manage screen can use it
// later; `npm run export` uses it from the terminal now. The backup's books.csv
// shares the author and series wording.

import { flagText, shelfText } from '../categories/review.js'

// work id → ["Le Guin, Ursula K.", "Smith, Jo (Translator)"], in credit order.
export function creditsByWork(authors, work_authors) {
  const authorById = new Map(authors.map((a) => [a.id, a]))
  const creditName = (credit) => authorById.get(credit.author_id)?.display_name ?? '?'
  // Names settle ties in position, which a restore into another library would reorder.
  const inOrder = [...work_authors].sort((a, b) => a.position - b.position || creditName(a).localeCompare(creditName(b)))
  const byWork = new Map()
  for (const credit of inOrder) {
    const name = creditName(credit)
    const label = credit.role === 'Author' ? name : `${name} (${credit.role})`
    byWork.set(credit.work_id, [...(byWork.get(credit.work_id) ?? []), label])
  }
  return byWork
}

// copy id → ["Lumberjanes 10", …] for series or publisher's series links.
export function labelsByCopy(links, lists, idColumn) {
  const nameById = new Map(lists.map((l) => [l.id, l.name]))
  const byCopy = new Map()
  for (const link of [...links].sort((a, b) => a.position - b.position)) {
    const label = [nameById.get(link[idColumn]) ?? '?', link.number].filter(Boolean).join(' ')
    byCopy.set(link.copy_id, [...(byCopy.get(link.copy_id) ?? []), label])
  }
  return byCopy
}

// Text that Excel and Numbers must not turn into a number (ISBN-10s can start with 0).
const asText = { type: String, format: '@' }

// Each column: its heading, width (in characters), and how to get its value.
// `type: Number` lets years and pages sort as numbers.
const COLUMNS = [
  { header: 'Title', width: 40, get: (b) => b.copy.title },
  { header: 'Authors', width: 30, get: (b) => b.credits.join('; ') },
  { header: 'Series', width: 24, get: (b) => b.series.join('; ') },
  { header: 'Main category', width: 18, get: (b) => b.mainCategory },
  { header: 'Subcategories', width: 28, get: (b) => b.subcategories },
  { header: 'Also in', width: 24, get: (b) => b.alsoIn },
  { header: 'Audience', width: 9, get: (b) => b.copy.audience },
  { header: 'First published', width: 9, type: Number, get: (b) => b.work?.first_published_year },
  { header: 'Edition year', width: 9, type: Number, get: (b) => b.copy.edition_year },
  { header: 'Publisher', width: 24, get: (b) => b.copy.publisher },
  { header: "Publisher's series", width: 20, get: (b) => b.publisherSeries.join('; ') },
  { header: 'Binding', width: 11, get: (b) => b.copy.binding },
  { header: 'Pages', width: 7, type: Number, get: (b) => b.copy.pages },
  { header: 'Languages', width: 10, get: (b) => b.copy.languages?.join('; ') },
  { header: 'ISBN-13', width: 15, ...asText, get: (b) => b.copy.isbn13 },
  { header: 'ISBN-10', width: 12, ...asText, get: (b) => b.copy.isbn10 },
  { header: 'Year acquired', width: 9, type: Number, get: (b) => b.copy.acquired_year },
  { header: 'City acquired', width: 14, get: (b) => b.copy.acquired_city },
  { header: 'State or region acquired', width: 14, get: (b) => b.copy.acquired_region },
  { header: 'Country acquired', width: 14, get: (b) => b.copy.acquired_country },
  { header: 'Original title', width: 30, get: (b) => b.copy.original_title },
  { header: 'Edition note', width: 20, get: (b) => b.copy.edition_note },
  { header: 'Notes', width: 30, get: (b) => b.copy.notes },
  { header: 'LC call number', width: 16, ...asText, get: (b) => b.copy.lc_call_number ?? b.copy.lcc },
  { header: 'Dewey', width: 10, ...asText, get: (b) => b.copy.dewey },
  { header: 'Subjects', width: 40, get: (b) => b.copy.subjects?.map((parts) => parts.join(' -- ')).join('; ') },
  { header: 'Date added', width: 11, ...asText, get: (b) => b.copy.added_on },
  { header: 'Needs checking', width: 9, get: (b) => (b.copy.needs_review ? 'yes' : '') },
  { header: 'Checking note', width: 30, get: (b) => b.copy.review_note },
  { header: 'Category review', width: 24, get: (b) => b.copy.category_review?.flags.map(flagText).join('; ') },
  { header: 'Cover link', width: 30, get: (b) => coverLink(b.copy) },
]

// The cover at its saved size: a Google link or photo as saved, else Open Library's large one.
const coverLink = (copy) =>
  copy.cover_url ?? (copy.cover_id ? `https://covers.openlibrary.org/b/id/${copy.cover_id}-L.jpg` : null)

// Rows for write-excel-file: a bold heading row, then one row per book sorted by
// title, then authors. Returns { sheetData, columns } (columns carries the widths).
export function bookSheet({ works, authors, work_authors, copies, categories, book_categories, series, publisher_series, copy_series, copy_publisher_series }) {
  const workById = new Map(works.map((w) => [w.id, w]))
  const credits = creditsByWork(authors, work_authors)
  const seriesByCopy = labelsByCopy(copy_series, series, 'series_id')
  const publisherSeriesByCopy = labelsByCopy(copy_publisher_series, publisher_series, 'publisher_series_id')
  const shelvesByCopy = new Map()
  for (const shelf of book_categories) shelvesByCopy.set(shelf.copy_id, [...(shelvesByCopy.get(shelf.copy_id) ?? []), shelf])

  const books = copies.map((copy) => {
    // "Fiction › Fantasy, Horror" → main category and subcategories in their own columns.
    const shelved = shelfText({ ...copy, shelves: shelvesByCopy.get(copy.id) ?? [] }, categories)
    const [mainCategory = '', subcategories = ''] = shelved.main.split(' › ')
    return {
      copy,
      work: workById.get(copy.work_id),
      credits: credits.get(copy.work_id) ?? [],
      series: seriesByCopy.get(copy.id) ?? [],
      publisherSeries: publisherSeriesByCopy.get(copy.id) ?? [],
      mainCategory,
      subcategories,
      alsoIn: shelved.alsoIn.join('; '),
    }
  })
  const byWords = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  books.sort((a, b) => byWords(a.copy.title, b.copy.title) || byWords(a.credits.join(), b.credits.join()))

  const cell = (column, value) => {
    if (value == null || value === '') return null
    const { type = String, format } = column
    return { type, value: type === Number ? Number(value) : String(value), ...(format && { format }) }
  }
  const sheetData = [
    COLUMNS.map((column) => ({ value: column.header, fontWeight: 'bold' })),
    ...books.map((book) => COLUMNS.map((column) => cell(column, column.get(book)))),
  ]
  return { sheetData, columns: COLUMNS.map(({ width }) => ({ width })) }
}
