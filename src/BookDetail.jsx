import { coverUrl } from './useCatalog.js'

// "650 _0 African Americans ‡x Folklore." from a stored LC subject field.
function formatMarcField({ tag, ind1, ind2, sub }) {
  const ind = `${ind1}${ind2}`.replace(/ /g, '_')
  const text = sub.map(([code, value], i) => (i === 0 && code === 'a' ? value : `‡${code} ${value}`)).join(' ')
  return `${tag} ${ind} ${text}`
}

// Everything stored for one copy. A plain view for checking the data;
// the designed book page (mockup screen 3) comes later.
function BookDetail({ copy, onBack }) {
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
    ['Date cataloged', copy.added_on],
  ]

  return (
    <div className="book-detail">
      <button className="link" onClick={onBack}>
        ‹ Back
      </button>
      {copy.cover_id && <img className="cover" src={coverUrl(copy, 'M')} alt="" />}
      <h2>{copy.title}</h2>
      <p className="book-meta">{copy.byline}</p>

      {copy.needs_review && <p className="review-note">⚠︎ Needs checking: {copy.review_note}</p>}

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
