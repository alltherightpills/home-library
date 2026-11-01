import { coverUrl } from './useCatalog.js'

// A list of books with covers: the main list, and the books in a series.
function BookList({ books, onOpenBook }) {
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
            <span className="book-meta">{c.listLine}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default BookList
