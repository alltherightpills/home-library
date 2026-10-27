import { useEffect, useMemo, useRef, useState } from 'react'
import { normalize, searchWords } from './useCatalog.js'

// How many suggestions of each kind the dropdown shows.
const LIMIT = 3

// Every title, author, and subject heading in the library, with how many books have it.
function buildIndex(copies) {
  const titles = copies.map((c) => ({ text: c.title, note: c.byline, copy: c, key: normalize(c.title) }))
  const tally = (names) => {
    const found = new Map()
    for (const [name, copyId] of names) {
      const key = normalize(name)
      const entry = found.get(key) ?? { text: name, key, ids: new Set() }
      entry.ids.add(copyId)
      found.set(key, entry)
    }
    return [...found.values()].map((e) => ({ ...e, count: e.ids.size }))
  }
  const authors = tally(copies.flatMap((c) => c.people.map((p) => [p.author.display_name, c.id])))
  const subjects = tally(copies.flatMap((c) => c.headings.map((h) => [h, c.id])))
  return { titles, authors, subjects }
}

// Best matches first: ones that start with what was typed, then the most common.
function topMatches(items, words, start) {
  return items
    .filter((item) => words.every((w) => item.key.includes(w)))
    .sort(
      (a, b) =>
        b.key.startsWith(start) - a.key.startsWith(start) ||
        (b.count ?? 0) - (a.count ?? 0) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, LIMIT)
}

// The Library search bar, with Google-style suggestions while typing.
function SearchBox({ copies, query, setQuery, onOpenBook }) {
  const [suggesting, setSuggesting] = useState(false)
  const box = useRef(null)
  const input = useRef(null)
  const index = useMemo(() => buildIndex(copies), [copies])

  const groups = useMemo(() => {
    const words = searchWords(query)
    if (!suggesting || normalize(query).trim().length < 2) return []
    const start = normalize(query).trim()
    return [
      ['Titles', 'title', topMatches(index.titles, words, start)],
      ['Authors', 'author', topMatches(index.authors, words, start)],
      ['Subjects', 'subject', topMatches(index.subjects, words, start)],
    ].filter(([, , items]) => items.length)
  }, [index, query, suggesting])

  // Tapping anywhere outside the search box closes the suggestions.
  useEffect(() => {
    const close = (e) => box.current?.contains(e.target) || setSuggesting(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  function done() {
    setSuggesting(false)
    input.current.blur() // put the keyboard away
  }

  function choose(kind, item) {
    done()
    if (kind === 'title') onOpenBook(item.copy.id)
    else setQuery(item.text)
  }

  return (
    <form
      className="search-box"
      ref={box}
      onSubmit={(e) => {
        e.preventDefault() // the keyboard's Search key just closes suggestions
        done()
      }}
    >
      <input
        ref={input}
        className="search"
        type="search"
        placeholder="Search title, author, or subject"
        // No autocorrect: its bubble covers the first suggestion, and it "fixes" author names.
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSuggesting(true)
        }}
        onFocus={() => setSuggesting(true)}
      />
      {query && (
        <button
          type="button"
          className="clear"
          aria-label="Clear search"
          onClick={() => {
            setQuery('')
            setSuggesting(false)
          }}
        >
          ✕
        </button>
      )}

      {groups.length > 0 && (
        <div className="suggestions">
          {groups.map(([label, kind, items]) => (
            <div key={kind}>
              <p className="suggestion-label">{label}</p>
              {items.map((item) => (
                <button type="button" key={item.copy?.id ?? item.key}onClick={() => choose(kind, item)}>
                  <span>{item.text}</span>
                  <span className="book-meta">{item.note ?? `${item.count} ${item.count === 1 ? 'book' : 'books'}`}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </form>
  )
}

export default SearchBox
