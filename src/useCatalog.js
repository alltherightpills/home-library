import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// The columns the app needs for each copy, plus its work and the people on it.
// (Leaves out lt_record, the large original LibraryThing data.)
const COLUMNS = `
  id, library_id, title, isbn13, isbn10, publisher, edition_year, pages, binding, languages,
  lcc, dewey, dewey_wording, subjects, lt_genres, needs_review, review_note, added_on,
  cover_id, cover_url, cover_source, lc_call_number, lc_subjects,
  acquired_year, acquired_city, acquired_region, acquired_country,
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

  // Show a change that was just saved, without reloading the whole catalog.
  function updateCopy(id, changes) {
    setCopies((all) => all.map((c) => (c.id === id ? withDisplayFields({ ...c, ...changes }) : c)))
  }

  // The same for a work, which every copy of it shares.
  function updateWork(workId, changes) {
    setCopies((all) =>
      all.map((c) => (c.work?.id === workId ? withDisplayFields({ ...c, work: { ...c.work, ...changes } }) : c)),
    )
  }

  function removeCopy(id) {
    setCopies((all) => all.filter((c) => c.id !== id))
  }

  return { copies, error, updateCopy, updateWork, removeCopy }
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

// The cover image for a copy, or null. A picked cover or photo (cover_url) wins;
// otherwise the Open Library cover in size S, M, or L.
export function coverUrl(copy, size) {
  if (copy.cover_url) return copy.cover_url
  return copy.cover_id ? `https://covers.openlibrary.org/b/id/${copy.cover_id}-${size}.jpg` : null
}

// The words of a search, ignoring punctuation like "--".
export function searchWords(query) {
  return normalize(query).split(/[^\p{L}\p{N}']+/u).filter(Boolean)
}

// Letters that aren't an accent on a plain letter, so removing accents misses them.
const SPECIAL_LETTERS = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', æ: 'ae', œ: 'oe', ß: 'ss', ı: 'i' }

// Lowercase and strip accents, so "pokemon" matches "Pokémon" and "soren" matches "Søren".
export function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[øłđðþæœßı]/g, (letter) => SPECIAL_LETTERS[letter])
}
