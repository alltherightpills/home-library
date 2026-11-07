import { useMemo } from 'react'
import Lettered from './LetterIndex.jsx'
import { letterStarts } from './letters.js'
import { coverUrl } from './useCatalog.js'

export function SortSelect({ sort, setSort }) {
  return (
    <label>
      Sort{' '}
      <select value={sort} onChange={(e) => setSort(e.target.value)}>
        <option value="author">Author A–Z</option>
        <option value="title">Title A–Z</option>
        <option value="added">Date cataloged</option>
      </select>
    </label>
  )
}

// List or Gallery, for every list of books; Library remembers the choice on the phone.
export function ViewToggle({ view, setView }) {
  return (
    <span className="view-toggle" role="group" aria-label="Show as">
      {['list', 'gallery'].map((v) => (
        <button key={v} className={v === view ? 'chip active' : 'chip'} onClick={() => setView(v)}>
          {v === 'list' ? 'List' : 'Gallery'}
        </button>
      ))}
    </span>
  )
}

// All / Unread / Read, for every list of books. Library keeps the choice while
// the app is open (not on the phone, so a filter can't hide books unnoticed),
// and leaves `setFilter` out until the reading history has loaded.
export function ReadFilter({ filter, setFilter }) {
  if (!setFilter) return null
  return (
    <span className="view-toggle" role="group" aria-label="Read or not">
      {['all', 'unread', 'read'].map((f) => (
        <button key={f} className={f === filter ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>
          {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Read'}
        </button>
      ))}
    </span>
  )
}

const ReadMark = ({ copy }) => copy.read && <span className="read-mark" title="You've read this">✓ </span>

// The sort key each A–Z order files a book under (the strip follows the sort).
const LETTER_KEYS = { author: (c) => c.authorSort, title: (c) => c.titleSort }

// A list of books with covers: the main list, a category's, and a series'.
// `noteFor` can put a few words before a book's gray line ("Also in").
// As a gallery: covers three across, with the title and author under each.
// A ✓ before the title marks a book you've read. `letters` is the list's sort
// ('author' or 'title'; anything else, such as date cataloged, has no strip):
// a long list gets the A–Z strip down the right edge.
function BookList({ books, onOpenBook, noteFor, view = 'list', letters }) {
  const starts = useMemo(() => (LETTER_KEYS[letters] ? letterStarts(books.map(LETTER_KEYS[letters])) : null), [books, letters])
  return <Lettered starts={starts}>{view === 'gallery' ? <Gallery books={books} onOpenBook={onOpenBook} noteFor={noteFor} starts={starts} /> : <Rows books={books} onOpenBook={onOpenBook} noteFor={noteFor} starts={starts} />}</Lettered>
}

function Gallery({ books, onOpenBook, noteFor, starts }) {
    return (
      <ul className="book-gallery">
        {books.map((c, i) => {
          const src = coverUrl(c, 'G')
          return (
            <li key={c.id} data-letter={starts?.get(i)}>
              <button onClick={() => onOpenBook(c.id)}>
                <span className="gallery-cover">
                  {src ? <img src={src} alt="" loading="lazy" /> : <span className="gallery-blank">{c.title}</span>}
                </span>
                <span className="gallery-title">
                  <ReadMark copy={c} />
                  {c.needs_review && <span className="flag">⚠︎ </span>}
                  {c.title}
                </span>
                <span className="gallery-meta">{[noteFor?.(c), c.byline].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
}

function Rows({ books, onOpenBook, noteFor, starts }) {
  return (
    <ul className="book-list">
      {books.map((c, i) => (
        <li key={c.id} data-letter={starts?.get(i)}>
          <button onClick={() => onOpenBook(c.id)}>
            <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" loading="lazy" />}</span>
            <span className="book-title">
              <ReadMark copy={c} />
              {c.needs_review && <span className="flag">⚠︎ </span>}
              {c.title}
            </span>
            <span className="book-meta">{[noteFor?.(c), c.listLine].filter(Boolean).join(' · ')}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default BookList
