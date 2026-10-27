import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// The columns the app needs for each copy, plus its work and the people on it.
// (Leaves out lt_record, the large original LibraryThing data.)
const COLUMNS = `
  id, title, isbn13, isbn10, publisher, edition_year, pages, binding, languages,
  lcc, dewey, dewey_wording, subjects, lt_genres, needs_review, review_note, added_on,
  cover_id, cover_source, lc_call_number, lc_subjects,
  work:works ( id, title, first_published_year, first_published_source, original_language,
    contributors:work_authors ( role, position, author:authors ( id, sort_name, display_name ) ) )
`

const PAGE = 1000 // the most rows the server returns per request

// Loads every copy in the library once, when signed in.
export function useCatalog() {
  const [copies, setCopies] = useState(null) // null while loading
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const all = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('copies')
          .select(COLUMNS)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) {
          if (!cancelled) setError(error.message)
          return
        }
        all.push(...data)
        if (data.length < PAGE) break
      }
      if (!cancelled) setCopies(all.map(withDisplayFields))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { copies, error }
}

// Main roles shown as "by ..." on a book; others (Editor, Illustrator...) show on the book page.
const MAIN_ROLES = ['Author', 'Creator', 'Primary Contributor', 'Original Author']

// Adds ready-to-use author text and a search key to each copy.
function withDisplayFields(copy) {
  const people = [...(copy.work?.contributors ?? [])].sort((a, b) => a.position - b.position)
  const main = people.filter((p) => MAIN_ROLES.includes(p.role))
  const shown = main.length ? main : people
  const headings = subjectHeadings(copy)
  return {
    ...copy,
    people,
    headings,
    byline: shown.map((p) => p.author.display_name).join(', '),
    authorSort: shown[0]?.author.sort_name ?? '',
    titleSort: titleSortKey(copy.title, copy.languages),
    searchText: normalize(
      [copy.title, ...people.map((p) => `${p.author.display_name} ${p.author.sort_name}`), ...headings].join(' '),
    ),
  }
}

// LC and LibraryThing subject headings as "Tales -- Japan" text, without repeats.
function subjectHeadings(copy) {
  // Drop end punctuation, but keep the period of an initial like "J. R. R."
  const tidy = (part) => part.trim().replace(/[,;:]+$/, '').replace(/(?<!\b\p{Lu})\.$/u, '')
  const lc = copy.lc_subjects.map((f) => {
    // ‡v ‡x ‡y ‡z are subdivisions and get "--"; other parts (name, dates, title) run together.
    const chunks = []
    for (const [code, value] of f.sub) {
      if (!/[a-z]/.test(code)) continue // skip ‡0 / ‡2 source codes
      if (chunks.length === 0 || 'vxyz'.includes(code)) chunks.push(value)
      else chunks[chunks.length - 1] += ` ${value}`
    }
    return chunks.map(tidy).join(' -- ')
  })
  const lt = copy.subjects.map((parts) => parts.map(tidy).join(' -- '))
  const seen = new Set()
  return [...lc, ...lt].filter((h) => h && !seen.has(normalize(h)) && seen.add(normalize(h)))
}

// Leading articles to skip when sorting by title, by the book's language
// (like MARC nonfiling characters). "Die Hard" keeps its "Die"; a German "Die ..." doesn't.
const ARTICLES = {
  English: ['the', 'an', 'a'],
  French: ['les', 'le', 'la', "l'", 'une', 'un'],
  Spanish: ['los', 'las', 'el', 'la', 'una', 'un'],
  German: ['der', 'die', 'das', 'eine', 'ein'],
  Italian: ['gli', 'il', 'lo', 'la', 'le', 'i', "l'", 'una', 'uno', 'un'],
}

// "The Hobbit" → "hobbit", ignoring opening quotes or brackets too.
function titleSortKey(title, languages) {
  const langs = languages.length ? languages : ['English']
  const articles = langs.flatMap((lang) => ARTICLES[lang] ?? [])
  let key = normalize(title).replace(/^[^\p{L}\p{N}]+/u, '').replace(/’/g, "'")
  const article = articles.find((a) => key.startsWith(a.endsWith("'") ? a : `${a} `))
  if (article) key = key.slice(article.length).trimStart()
  return key
}

// Open Library cover image for a copy (size S, M, or L), or null.
export function coverUrl(copy, size) {
  return copy.cover_id ? `https://covers.openlibrary.org/b/id/${copy.cover_id}-${size}.jpg` : null
}

// The words of a search, ignoring punctuation like "--".
export function searchWords(query) {
  return normalize(query).split(/[^\p{L}\p{N}']+/u).filter(Boolean)
}

// Lowercase and strip accents, so "pokemon" matches "Pokémon".
export function normalize(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
