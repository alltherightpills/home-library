import { useEffect, useState } from 'react'
import CoverPicker from './CoverPicker.jsx'
import EditBook from './EditBook.jsx'
import { coverUrl } from './useCatalog.js'

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
  photo: 'your photo',
}

// Everything stored for one copy. A plain view for checking the data;
// the designed book page (mockup screen 3) comes later.
function BookDetail({ copy, onBack, onCoverChange, sharedWork, updateCopy, updateWork, onRemoved }) {
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

  const firstPublished = copy.work?.first_published_year
  const rows = [
    ['Contributors', copy.people.map((p) => `${p.author.display_name} (${p.role})`).join('; ')],
    ['Work', copy.work?.title],
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

      {copy.needs_review && <p className="review-note">⚠︎ Needs checking{copy.review_note && `: ${copy.review_note}`}</p>}

      <dl>
        {rows
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
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
