import { useEffect, useMemo, useRef, useState } from 'react'
import { labelIndex } from './series.js'
import { normalize, searchWords } from './useCatalog.js'

// How many suggestions of each kind the dropdown shows.
const LIMIT = 3

// Every title, author, series, and subject heading in the library, with how many books have it.
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
  // Other spellings of a series find it too.
  const labels = (kind) =>
    labelIndex(copies, kind).map((e) => ({ text: e.name, id: e.id, count: e.count, key: normalize([e.name, ...e.aliases].join(' ')) }))
  return { titles, authors, subjects, series: labels('series'), publisherSeries: labels('publisherSeries') }
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

// The on-screen keyboard: how far up from the bottom of the window it reaches
// (0 when it's closed), and the height of the part of the page still showing.
// iPhone Safari doesn't shrink the page for the keyboard; it slides the visible
// part (window.visualViewport) over it, so a bar pinned to the bottom of the
// window would end up behind the keyboard without this.
function useKeyboard() {
  const [keyboard, setKeyboard] = useState({ inset: 0, visible: window.innerHeight })
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    const update = () => {
      const inset = document.documentElement.clientHeight - view.height - view.offsetTop
      // Safari's toolbar coming and going moves things a little; that isn't the keyboard.
      setKeyboard({ inset: inset > 80 ? Math.round(inset) : 0, visible: Math.round(view.height) })
    }
    update()
    view.addEventListener('resize', update)
    view.addEventListener('scroll', update)
    return () => {
      view.removeEventListener('resize', update)
      view.removeEventListener('scroll', update)
    }
  }, [])
  return keyboard
}

// The Library search bar, pinned to the bottom of the screen above the tabs
// (or above the keyboard while typing), with Google-style suggestions that
// open upward.
function SearchBox({ copies, query, setQuery, onOpenBook, onOpenLabel }) {
  const [suggesting, setSuggesting] = useState(false)
  const keyboard = useKeyboard()
  // While typing on a phone, the tab bar steps aside so the search bar sits on
  // the keyboard (the `search-typing` rule in index.css). Safari may shrink the
  // page for the keyboard instead of covering it, so `keyboard` can't tell;
  // being focused can.
  const [typing, setTyping] = useState(false)
  const blurTimer = useRef(null)
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
      ['Series', 'series', topMatches(index.series, words, start)],
      ["Publisher's series", 'publisherSeries', topMatches(index.publisherSeries, words, start)],
      ['Subjects', 'subject', topMatches(index.subjects, words, start)],
    ].filter(([, , items]) => items.length)
  }, [index, query, suggesting])

  useEffect(() => {
    document.documentElement.classList.toggle('search-typing', typing)
  }, [typing])
  useEffect(() => () => document.documentElement.classList.remove('search-typing'), [])

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
    else if (item.id) onOpenLabel(kind, item.id)
    else setQuery(item.text)
  }

  return (
    <form
      className="search-box"
      ref={box}
      style={keyboard.inset ? { bottom: keyboard.inset } : undefined}
      onSubmit={(e) => {
        e.preventDefault() // the keyboard's Search key just closes suggestions
        done()
      }}
    >
      <input
        ref={input}
        className="search"
        type="search"
        placeholder="Search title, author, series, or subject"
        // No autocorrect: its bubble covers the first suggestion, and it "fixes" author names.
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSuggesting(true)
        }}
        onFocus={() => {
          clearTimeout(blurTimer.current)
          setTyping(true)
          setSuggesting(true)
        }}
        // A tap on a suggestion takes the focus first; bringing the tabs back at
        // once would move the suggestions out from under that tap.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setTyping(false), 300)
        }}
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
        // Room above the bar: the visible page, less the bar, the tabs unless typing hid them, and a margin.
        <div className="suggestions" style={{ maxHeight: Math.max(160, keyboard.visible - (keyboard.inset || typing ? 80 : 130)) }}>
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
