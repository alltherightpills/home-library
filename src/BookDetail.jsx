import { useEffect, useState } from 'react'
import { QUESTIONS, answerWords } from './assessments.js'
import BookLending from './BookLending.jsx'
import BookReading from './BookReading.jsx'
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

// Pick for me's judged answers, labeled as on its screen. "Steady (Claude,
// unsure)"; the owner's own answers need no note.
const JUDGED_LABELS = { international: 'View', driven: 'Driven', pace: 'Pace', mood: 'Mood' }
function judgedRows(work) {
  return QUESTIONS.map((q) => {
    const stored = work?.assessments?.find((a) => a.question === q.id)
    if (!stored) return [JUDGED_LABELS[q.id], null]
    const whose = stored.set_by === 'claude' ? (stored.sure ? ' (Claude)' : ' (Claude, unsure)') : ''
    return [JUDGED_LABELS[q.id], `${answerWords(stored.answer)}${whose}`]
  })
}

// LibraryThing's copy of the LC call number is usually the Library of
// Congress record's, shortened ("PS3519 .A392 .A6" for "PS3519.A392 A6
// 2017"); it shows only when it says something different (125 books on
// 2026-11-20, some of them real disagreements).
const callKey = (call) => call.replace(/[\s.]/g, '').toUpperCase()
const sameCallNumber = (lt, lc) => Boolean(lt && lc && callKey(lc).startsWith(callKey(lt)))

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
function BookDetail({ copy, copies, categories, readings, loans, onBack, onOpenBook, onOpenLabel, onCoverChange, sharedWork, updateCopy, updateWork, onRemoved }) {
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
  const soleAuthor = copy.people.length === 1 && copy.people[0].role === 'Author'
  // The rows in four sections (owner's grouping, 2026-11-20): the book itself,
  // what the app keeps about this copy, subject and genre, then record details.
  const sections = [
    {
      title: 'About the book',
      rows: [
        // A lone Author is already the line under the title; any other role
        // shows only here (owner, 2026-11-20).
        ['Contributors', !soleAuthor && copy.people.map((p) => `${p.author.display_name} (${p.role})`).join('; ')],
        ['Series', labelLinks('series')],
        ["Publisher's series", labelLinks('publisherSeries')],
        ['First published', firstPublished && `${firstPublished} (${copy.work.first_published_source ?? 'entered by hand'})`],
        // The same year twice says nothing more (owner, 2026-11-20).
        ['Edition year', copy.edition_year !== firstPublished && copy.edition_year],
        ['Publisher', copy.publisher],
        ['Edition note', copy.edition_note],
        ['Pages', copy.pages],
        ['Binding', copy.binding],
      ],
    },
    {
      title: 'In your library',
      rows: [
        ['Shelved in', shelved.main || 'No main category yet'],
        ['Also in', shelved.alsoIn.join('; ')],
        ['Audience', copy.audience],
        ['Location', copy.location],
        ['Year acquired', copy.acquired_year],
        ['Place acquired', [copy.acquired_city, copy.acquired_region, copy.acquired_country].filter(Boolean).join(', ')],
        ['Notes', copy.notes],
      ],
    },
    {
      title: 'Subject & genre',
      rows: [
        ['LibraryThing genres', copy.lt_genres.join(', ')],
        ['Dewey', [copy.dewey, copy.dewey_wording.join('; ')].filter(Boolean).join(' — ')],
        ...judgedRows(copy.work),
      ],
    },
    {
      title: 'Record details',
      rows: [
        ['Original title', copy.original_title !== copy.title && copy.original_title],
        ['ISBN-13', copy.isbn13],
        ['ISBN-10', copy.isbn10],
        ['LC call number (Library of Congress)', copy.lc_call_number],
        ['LC call number (LibraryThing)', !sameCallNumber(copy.lcc, copy.lc_call_number) && copy.lcc],
        ['Language', copy.languages.join(', ')],
        // Left out when it's the book's only language (owner, 2026-11-20); a
        // bilingual book keeps it, to say which language is the original.
        ['Original language', copy.languages.join() !== copy.work?.original_language && copy.work?.original_language],
        ['Date cataloged', copy.added_on],
        ['Cover from', COVER_SOURCES[copy.cover_source] ?? copy.cover_source],
      ],
    },
  ].map((s) => ({ ...s, rows: s.rows.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false) }))

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
        {coverUrl(copy, 'L') && (
          <span className="cover-wrap">
            <img className="cover" src={coverUrl(copy, 'L')} alt="" />
            {copy.read && (
              <span className="read-badge" title="You've read this">
                ✓
              </span>
            )}
          </span>
        )}
        <button className="link" onClick={pickCover}>
          {coverUrl(copy, 'L') ? 'Change cover' : 'Add a cover'}
        </button>
      </div>
      <h2>{copy.title}</h2>
      <p className="book-meta">{copy.byline}</p>
      {copy.work?.synopsis && <p className="synopsis">{copy.work.synopsis}</p>}

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

      <BookReading copy={copy} readings={readings} />
      <BookLending copy={copy} loans={loans} />

      {sections.map(
        (s) =>
          s.rows.length > 0 && (
            <section key={s.title}>
              <h3 className="detail-section">{s.title}</h3>
              <dl>
                {s.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ),
      )}

      {/* The subject heading lists finish Record details. */}
      {copy.lc_subjects.length > 0 && (
        <>
          <h4>LC subject headings</h4>
          <ul className="subjects">
            {copy.lc_subjects.map((field, i) => (
              <li key={i}>{formatMarcField(field)}</li>
            ))}
          </ul>
        </>
      )}

      {copy.subjects.length > 0 && (
        <>
          <h4>LibraryThing subject headings</h4>
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
