// Everything stored for one copy. A plain view for checking the import;
// the designed book page (mockup screen 3) comes later.
function BookDetail({ copy, onBack }) {
  const rows = [
    ['Contributors', copy.people.map((p) => `${p.author.display_name} (${p.role})`).join('; ')],
    ['Work', copy.work?.title],
    ['First published', copy.work?.first_published_year],
    ['Edition year', copy.edition_year],
    ['Publisher', copy.publisher],
    ['Pages', copy.pages],
    ['Binding', copy.binding],
    ['ISBN-13', copy.isbn13],
    ['ISBN-10', copy.isbn10],
    ['Language', copy.languages.join(', ')],
    ['Original language', copy.work?.original_language],
    ['LC call number', copy.lcc],
    ['Dewey', [copy.dewey, copy.dewey_wording.join('; ')].filter(Boolean).join(' — ')],
    ['LibraryThing genres', copy.lt_genres.join(', ')],
    ['Date added', copy.added_on],
  ]

  return (
    <div className="book-detail">
      <button className="link" onClick={onBack}>
        ‹ Back
      </button>
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

      {copy.subjects.length > 0 && (
        <>
          <h3>Subject headings</h3>
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
