// Lists of series and publisher's series, and the books in each. `kind` is the
// copy's field: 'series' or 'publisherSeries'.

const withoutArticle = (name) => name.replace(/^(the|a|an)\s+/i, '')

// Numbers compare by value, so 2 comes before 10.
const byNumber = (a, b) => a.localeCompare(b, undefined, { numeric: true })

// Every entry in use, A–Z, with how many books it has.
export function labelIndex(copies, kind) {
  const entries = new Map()
  for (const copy of copies) {
    for (const { id, name, aliases } of copy[kind]) {
      const entry = entries.get(id) ?? { id, name, aliases, count: 0 }
      entry.count++
      entries.set(id, entry)
    }
  }
  return [...entries.values()].sort((a, b) => withoutArticle(a.name).localeCompare(withoutArticle(b.name)))
}

// The books in one entry, in order: by number, with unnumbered books last. A book's
// other series label is its set, as with Lumberjanes Comics inside Lumberjanes, so
// books are grouped by set when they're in more than one. The number may be on
// either label. Books with no set come last, as "Other".
export function labelBooks(copies, kind, id) {
  const groups = new Map()
  let name = ''
  for (const copy of copies) {
    const own = copy[kind].find((label) => label.id === id)
    if (!own) continue
    name = own.name
    const set = kind === 'series' ? copy.series.find((label) => label.id !== id) : null
    const group = groups.get(set?.id ?? '') ?? { id: set?.id ?? '', name: set?.name ?? 'Other', books: [] }
    group.books.push({ copy, number: own.number || set?.number || '' })
    groups.set(group.id, group)
  }
  for (const group of groups.values()) {
    group.books.sort((a, b) => {
      if (a.number && b.number) return byNumber(a.number, b.number) || a.copy.titleSort.localeCompare(b.copy.titleSort)
      if (a.number || b.number) return a.number ? -1 : 1
      return a.copy.titleSort.localeCompare(b.copy.titleSort)
    })
  }
  const sets = [...groups.values()].sort((a, b) => {
    if (!a.id || !b.id) return a.id ? -1 : 1
    return withoutArticle(a.name).localeCompare(withoutArticle(b.name))
  })
  return { name, sets: sets.map((set) => ({ ...set, books: set.books.map((book) => book.copy) })) }
}
