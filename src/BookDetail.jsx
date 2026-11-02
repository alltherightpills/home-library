import { useEffect, useState } from 'react'
import { shelfText } from './categories/review.js'
import CoverPicker from './CoverPicker.jsx'
import EditBook from './EditBook.jsx'
import { coverUrl, normalize } from './useCatalog.js'

// "650 _0 African Americans ‡x Folklore." from a stored LC subject field.
function formatMarcField({ tag, ind1, ind2, sub }) {
  const ind = `${ind1}${ind2}`.replace(/ /g, '_')
  const text = sub.map(([code, value], i) => (i === 0 && code === 'a' ? value : `‡${code} ${value}`)).join(' ')
  return `${tag} ${ind} ${text}`
}

const COVER_SOURCES = {
  openlibrary_edition: 'Open Library (this edition)',
  openlibrary_work: 'Open Library (another edition)',
  picked_openlibrary: 'Open Library (picked by hand)',
  picked_google: 'Google Books (picked by hand)',
  google: 'Google Books (when the book was added)',
  photo: 'your photo',
}

// A title's words, ignoring punctuation, quotes and a leading article, so
// "The Voyage of the 'Dawn Treader'" matches "The Voyage of the "Dawn Treader"".
const titleWords = (title) =>
  normalize(title)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')

// What tells another copy of the same work apart: "Paperback · Collier Books · 1970",
// with its title first when that really differs.
function editionLabel(other, copy) {
  const facts = [other.binding, other.publisher, other.edition_year, other.edition_note].filter(Boolean)
  const sameFacts = facts.join() === [copy.binding, copy.publisher, copy.edition_year, copy.edition_note].filter(Boolean).join()
  const sameTitle = titleWords(other.title) === titleWords(copy.title)
  if (sameTitle && sameFacts) return 'another copy of this edition'
  return [!sameTitle && other.title, ...facts].filter(Boolean).join(' · ')
}

// Everything stored for one copy. A plain view for checking the data;
// the designed book page (mockup screen 3) comes later.
function BookDetail({ copy, copies, categories, onBack, onOpenBook, onOpenLabel, onCoverChange, sharedWork, updateCopy, updateWork, onRemoved }) {
  // The cover picker and edit screen are steps in the browser history too, so
  // swiping back closes them.
  const [picking, setPicking] = useState(() => Boolean(history.state?.cover))
  const [editing, setEditing] = useState(() => Boolean(history.state?.edit))

  useEffect(() => {
    const onPop = (e) => {
      setPicking(Boolean(e.state?.cover))
      setEditing(Boolean(e.state?.edit))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function pickCover() {
    history.pushState({ ...history.state, cover: true }, '')
    setPicking(true)
    window.scrollTo(0, 0)
  }

  function editBook() {
    history.pushState({ ...history.state, edit: true }, '')
    setEditing(true)
    window.scrollTo(0, 0)
  }

  if (editing) {
    return (
      <EditBook
        copy={copy}
        copies={copies}
        categories={categories}
        sharedWork={sharedWork}
        onCancel={() => history.back()}
        onSaved={() => history.back()}
        onRemoved={onRemoved}
        updateCopy={updateCopy}
        updateWork={updateWork}
      />
    )
  }

  if (picking) {
    return (
      <CoverPicker
        copy={copy}
        onCancel={() => history.back()}
        onPicked={(changes) => {
          onCoverChange(changes)
          history.back()
        }}
      />
    )
  }

  // Each name opens the books in that series.
  const labelLinks = (kind) =>
    copy[kind].length > 0 &&
    copy[kind].map((label, i) => (
      <span key={label.id}>
        {i > 0 && '; '}
        <button className="link" onClick={() => onOpenLabel(kind, label.id)}>
          {label.name}
        </button>
        {label.number && ` #${label.number}`}
      </span>
    ))

  // Other copies of the same work: another edition, or a second copy of this one.
  const alsoOwn = copies.filter((c) => c.id !== copy.id && c.work && c.work.id === copy.work?.id)

  const firstPublished = copy.work?.first_published_year
  const shelved = shelfText(copy, categories)
  const rows = [
    ['Shelved in', shelved.main || 'No main category yet'],
    ['Also in', shelved.alsoIn.join('; ')],
    ['Audience', copy.audience],
    ['Contributors', copy.people.map((p) => `${p.author.display_name} (${p.role})`).join('; ')],
    ['Work', copy.work?.title],
    ['Series', labelLinks('series')],
    ["Publisher's series", labelLinks('publisherSeries')],
    ['Edition note', copy.edition_note],
    ['Original title', copy.original_title !== copy.title && copy.original_title],
    ['Notes', copy.notes],
    ['First published', firstPublished && `${firstPublished} (${copy.work.first_published_source ?? 'entered by hand'})`],
    ['Edition year', copy.edition_year],
    ['Publisher', copy.publisher],
    ['Pages', copy.pages],
    ['Binding', copy.binding],
    ['ISBN-13', copy.isbn13],
    ['ISBN-10', copy.isbn10],
    ['Language', copy.languages.join(', ')],
    ['Original language', copy.work?.original_language],
    ['LC call number', copy.lc_call_number],
    ['LibraryThing call number', copy.lcc],
    ['Dewey', [copy.dewey, copy.dewey_wording.join('; ')].filter(Boolean).join(' — ')],
    ['LibraryThing genres', copy.lt_genres.join(', ')],
    ['Year acquired', copy.acquired_year],
    ['Place acquired', [copy.acquired_city, copy.acquired_region, copy.acquired_country].filter(Boolean).join(', ')],
    ['Date cataloged', copy.added_on],
    ['Cover from', COVER_SOURCES[copy.cover_source] ?? copy.cover_source],
  ]

  return (
    <div className="book-detail">
      <div className="detail-actions">
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
        <button className="link" onClick={editBook}>
          Edit book
        </button>
      </div>
      <div className="cover-area">
        {coverUrl(copy, 'L') && <img className="cover" src={coverUrl(copy, 'L')} alt="" />}
        <button className="link" onClick={pickCover}>
          {coverUrl(copy, 'L') ? 'Change cover' : 'Add a cover'}
        </button>
      </div>
      <h2>{copy.title}</h2>
      <p className="book-meta">{copy.byline}</p>

      {alsoOwn.length > 0 && (
        <p className="also-own">
          You also own:{' '}
          {alsoOwn.map((other, i) => (
            <span key={other.id}>
              {i > 0 && '; '}
              <button className="link" onClick={() => onOpenBook(other.id)}>
                {editionLabel(other, copy)}
              </button>
            </span>
          ))}
        </p>
      )}

      {copy.needs_review && <p className="review-note">⚠︎ Needs checking{copy.review_note && `: ${copy.review_note}`}</p>}

      <dl>
        {rows
          .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {copy.lc_subjects.length > 0 && (
        <>
          <h3>LC subject headings</h3>
          <ul className="subjects">
            {copy.lc_subjects.map((field, i) => (
              <li key={i}>{formatMarcField(field)}</li>
            ))}
          </ul>
        </>
      )}

      {copy.subjects.length > 0 && (
        <>
          <h3>LibraryThing subject headings</h3>
          <ul className="subjects">
            {copy.subjects.map((parts, i) => (
              <li key={i}>{parts.join(' -- ')}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default BookDetail
