import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// The columns the app needs for each copy, plus its work and the people on it.
// (Leaves out lt_record, the large original LibraryThing data.)
const COLUMNS = `
  id, title, isbn13, isbn10, publisher, edition_year, pages, binding, languages,
  lcc, dewey, dewey_wording, subjects, lt_genres, needs_review, review_note, added_on,
  work:works ( id, title, first_published_year, original_language,
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
  return {
    ...copy,
    people,
    byline: shown.map((p) => p.author.display_name).join(', '),
    authorSort: shown[0]?.author.sort_name ?? '',
    searchText: normalize(`${copy.title} ${people.map((p) => `${p.author.display_name} ${p.author.sort_name}`).join(' ')}`),
  }
}

// Lowercase and strip accents, so "pokemon" matches "Pokémon".
export function normalize(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
