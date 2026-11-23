import { normalize } from './normalize.js'

// LC and LibraryThing subject headings as "Tales -- Japan" text, without repeats.
// Used by the catalog (useCatalog.js) and the assessment worksheet.
export function subjectHeadings(copy) {
  // Drop end punctuation, but keep the period of an initial like "J. R. R."
  const tidy = (part) => part.trim().replace(/[,;:]+$/, '').replace(/(?<!\b\p{Lu})\.$/u, '')
  const lc = (copy.lc_subjects ?? []).map((f) => {
    // ‡v ‡x ‡y ‡z are subdivisions and get "--"; other parts (name, dates, title) run together.
    const chunks = []
    for (const [code, value] of f.sub) {
      if (!/[a-z]/.test(code)) continue // skip ‡0 / ‡2 source codes
      if (chunks.length === 0 || 'vxyz'.includes(code)) chunks.push(value)
      else chunks[chunks.length - 1] += ` ${value}`
    }
    return chunks.map(tidy).join(' -- ')
  })
  const lt = (copy.subjects ?? []).map((parts) => parts.map(tidy).join(' -- '))
  const seen = new Set()
  return [...lc, ...lt].filter((h) => h && !seen.has(normalize(h)) && seen.add(normalize(h)))
}
