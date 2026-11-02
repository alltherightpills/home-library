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

// A list of books with covers: the main list, a category's, and a series'.
// `noteFor` can put a few words before a book's gray line ("Also in").
function BookList({ books, onOpenBook, noteFor }) {
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
