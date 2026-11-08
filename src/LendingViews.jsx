import { useState } from 'react'
import BookList from './BookList.jsx'
import { BackBar, Row } from './CategoryView.jsx'
import { dateText, today } from './dates.js'
import { Field } from './EditBook.jsx'
import { borrowerLoans, borrowerRows, howLong, lentByPerson, renameProblem } from './lending.js'

const bookCount = (n) => `${n} ${n === 1 ? 'book' : 'books'}`

// "since Nov 8, 2026 (3 weeks)"
const sinceText = (loan) => `since ${dateText(loan.lent_on)} (${howLong(loan.lent_on, today())})`

// What a screen shows while lending hasn't loaded, or couldn't.
function notReady(loans) {
  if (loans.error) return <p className="error">Couldn't load lending: {loans.error}</p>
  if (!loans.loans) return <p className="placeholder">Loading…</p>
  return null
}

// The dashboard's Lent out screen: who has which books, and for how long.
export function LentOutView({ copies, loans, onOpenBook, onOpenPlace, onBack }) {
  const people = loans.loans ? lentByPerson(loans.loans, loans.borrowers, copies) : []
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Library" />
      <h2>Lent out</h2>
      {notReady(loans) ??
        (people.length === 0 ? (
          <p className="book-meta">Nothing is lent out right now.</p>
        ) : (
          people.map(({ borrower, books }) => (
            <section key={borrower.id}>
              <h3 className="section-label">
                <button className="link" onClick={() => onOpenPlace('borrower', borrower.id)}>
                  {borrower.name}
                </button>{' '}
                · {bookCount(books.length)}
              </h3>
              <BookList books={books} onOpenBook={onOpenBook} noteFor={(c) => sinceText(c.loan)} hideLent />
            </section>
          ))
        ))}
    </div>
  )
}

// Manage › Borrowers: everyone books have been lent to, A to Z.
export function BorrowersList({ loans, onOpenPlace, onBack }) {
  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Manage" />
      <h2>Borrowers</h2>
      {notReady(loans) ??
        (loans.borrowers.length === 0 ? (
          <p className="book-meta">Nobody yet. People are added when you lend them a book, from the book's page.</p>
        ) : (
          <ul className="category-rows">
            {borrowerRows(loans.borrowers, loans.loans).map(({ borrower, out, lent }) => (
              <Row
                key={borrower.id}
                name={borrower.name}
                detail={out ? `Has ${bookCount(out)} now` : ''}
                count={lent === 1 ? '1 loan' : `${lent} loans`}
                onOpen={() => onOpenPlace('borrower', borrower.id)}
              />
            ))}
          </ul>
        ))}
    </div>
  )
}

// One borrower: the books they have now and have returned, Rename, and Remove
// for someone with no loans.
export function BorrowerPage({ place, copies, loans, onOpenBook, onBack }) {
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const waiting = notReady(loans)
  const borrower = loans.borrowers?.find((b) => b.id === place.id)

  if (waiting || !borrower) {
    return (
      <div className="series-view">
        <BackBar onBack={onBack} label="Back" />
        {waiting ?? <p className="book-meta">This person isn't on the list any more.</p>}
      </div>
    )
  }

  const { out, back } = borrowerLoans(loans.loans, borrower.id, copies)
  const hasLoans = loans.loans.some((l) => l.borrower_id === borrower.id)

  async function remove() {
    if (!confirm(`Take ${borrower.name} off your borrowers list?`)) return
    setBusy(true)
    setError('')
    try {
      await loans.removeBorrower(borrower)
      onBack()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="series-view">
      <BackBar onBack={onBack} label="Back" />
      <h2>{borrower.name}</h2>
      {renaming ? (
        <RenameBorrowerForm borrower={borrower} loans={loans} onDone={() => setRenaming(false)} />
      ) : (
        <p>
          <button className="link strong" onClick={() => setRenaming(true)}>
            Rename
          </button>
          {!hasLoans && (
            <>
              {' · '}
              <button className="link" disabled={busy} onClick={remove}>
                Remove from the list
              </button>
            </>
          )}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <h3 className="section-label">Has now</h3>
      {out.length ? (
        <BookList books={out} onOpenBook={onOpenBook} noteFor={(c) => sinceText(c.loan)} hideLent />
      ) : (
        <p className="book-meta">Nothing right now.</p>
      )}

      {back.length > 0 && (
        <>
          <h3 className="section-label">Returned</h3>
          <BookList
            books={back}
            onOpenBook={onOpenBook}
            noteFor={(c) => `${dateText(c.loan.lent_on)} – ${dateText(c.loan.returned_on)}`}
            hideLent
          />
        </>
      )}
    </div>
  )
}

function RenameBorrowerForm({ borrower, loans, onDone }) {
  const [name, setName] = useState(borrower.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const problem = renameProblem(loans.borrowers, borrower, name)

  async function save(e) {
    e.preventDefault()
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await loans.rename(borrower, name)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    // edit-book: the shared form look (16px text, so the iPhone doesn't zoom).
    <form className="edit-book" onSubmit={save} noValidate>
      <Field label="Name" value={name} onChange={setName} />
      <p className="book-meta">Every loan to them shows the new name.</p>
      {(error || (problem && name.trim())) && <p className="error">{error || problem}</p>}
      <div className="reading-actions">
        <button className="primary" type="submit" disabled={busy}>
          Save
        </button>
        <button className="link" type="button" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
