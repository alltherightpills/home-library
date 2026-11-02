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

// A list of books with covers: the main list, a category's, and a series'.
// `noteFor` can put a few words before a book's gray line ("Also in").
// As a gallery: covers three across, with the title and author under each.
function BookList({ books, onOpenBook, noteFor, view = 'list' }) {
  if (view === 'gallery') {
    return (
      <ul className="book-gallery">
        {books.map((c) => {
          const src = coverUrl(c, 'G')
          return (
            <li key={c.id}>
              <button onClick={() => onOpenBook(c.id)}>
                <span className="gallery-cover">
                  {src ? <img src={src} alt="" loading="lazy" /> : <span className="gallery-blank">{c.title}</span>}
                </span>
                <span className="gallery-title">
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
  return (
    <ul className="book-list">
      {books.map((c) => (
        <li key={c.id}>
          <button onClick={() => onOpenBook(c.id)}>
            <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" loading="lazy" />}</span>
            <span className="book-title">
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
