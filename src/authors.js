// The rules behind Manage › Authors: everyone credited on a book, and what
// renaming one of them would do. No database access here, so tests can check them.

import { plain } from './bookLookups.js'

// "Joyce, James" → { last: 'Joyce', first: 'James' }; "Homer" has only a last name.
export function nameParts(sortName) {
  const comma = sortName.indexOf(',')
  if (comma === -1) return { last: sortName, first: '' }
  return { last: sortName.slice(0, comma).trim(), first: sortName.slice(comma + 1).trim() }
}

// Both ways a person's name is stored, from the two boxes:
// ('Le Guin', 'Ursula K.') → sort "Le Guin, Ursula K.", display "Ursula K. Le Guin".
export function nameForms(last, first) {
  const l = last.replace(/\s+/g, ' ').trim()
  const f = first.replace(/\s+/g, ' ').trim()
  return { sort_name: f ? `${l}, ${f}` : l, display_name: f ? `${f} ${l}` : l }
}

// Everyone credited on a book in the catalog, A to Z by sort name:
// [{ author, roles: ['Author', 'Translator'], books: [copy, …] }]. Each copy
// counts as a book, as everywhere else in the app.
export function peopleIn(copies) {
  const byId = new Map()
  for (const copy of copies) {
    for (const { author, role } of copy.people) {
      if (!byId.has(author.id)) byId.set(author.id, { author, roles: new Set(), books: new Set() })
      const person = byId.get(author.id)
      person.roles.add(role)
      person.books.add(copy)
    }
  }
  return [...byId.values()]
    .map((p) => ({ author: p.author, roles: [...p.roles].sort(), books: [...p.books] }))
    .sort((a, b) => a.author.sort_name.localeCompare(b.author.sort_name, undefined, { sensitivity: 'base' }))
}

// People whose name contains every typed word, ignoring accents and case
// ("garcia" finds García Márquez). Either name form matches.
export function filterPeople(people, query) {
  const words = plain(query).split(' ').filter(Boolean)
  if (!words.length) return people
  return people.filter(({ author }) => {
    const text = plain(`${author.sort_name} ${author.display_name}`)
    return words.every((w) => text.includes(w))
  })
}

// What renaming `author` to the typed name would do, for the form:
// { forms, problem, same, unchanged }. `same` is someone else who already has
// that exact name (a merge, not a rename); `alike` is someone else whose name
// differs only in accents, capitals or punctuation, worth a warning.
export function renamePlan(people, author, { last, first }) {
  const forms = nameForms(last, first)
  if (!last.trim()) return { forms, problem: 'A person needs a last name (or a single name, like Homer).' }
  if (forms.sort_name === author.sort_name) return { forms, unchanged: true }
  const others = people.map((p) => p.author).filter((a) => a.id !== author.id)
  const same = others.find((a) => a.sort_name === forms.sort_name) ?? null
  const alike = same ? null : (others.find((a) => plain(a.sort_name) === plain(forms.sort_name)) ?? null)
  return { forms, same, alike }
}
