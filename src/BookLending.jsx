import { useId, useState } from 'react'
import { Field } from './EditBook.jsx'
import { borrowerNamed, borrowerNames, borrowerProblem, currentLoan, loanText, loansOf } from './lending.js'

// The book page's Lending section: Lend it out, Returned, and the copy's loan
// history. Lending is shared by the household, so everyone sees the same loans.
function BookLending({ copy, loans }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState(null) // the name box's text while lending; null when closed
  const listId = useId()

  if (loans.error) return <p className="error">Couldn't load lending: {loans.error}</p>
  if (!loans.loans) return null

  const history = loansOf(loans.loans, copy.id)
  const out = currentLoan(loans.loans, copy.id)
  const past = history.filter((l) => l !== out)

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function lend(e) {
    e.preventDefault()
    const problem = borrowerProblem(name)
    if (problem) return setError(problem)
    if (await run(() => loans.lend(copy, name))) setName(null)
  }

  const known = name !== null && borrowerNamed(loans.borrowers, name)

  return (
    <section className="book-reading book-lending">
      <h3>Lending</h3>
      {out && <p>{loanText(out, loans.borrowers)}</p>}
      {name === null ? (
        <div className="reading-actions">
          {out ? (
            <button className="primary" disabled={busy} onClick={() => run(() => loans.giveBack(out))}>
              Returned
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => (setError(''), setName(''))}>
              Lend it out
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={lend}>
          <datalist id={listId}>
            {borrowerNames(loans.borrowers).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Field label="Lend to" value={name} onChange={setName} list={listId} />
          {name.trim() && (
            <p className="book-meta">{known ? `${known.name} is on your list.` : 'New name: they’ll be added to your borrowers.'}</p>
          )}
          <div className="reading-actions">
            <button className="primary" type="submit" disabled={busy}>
              Lend, dated today
            </button>
            <button className="link" type="button" disabled={busy} onClick={() => (setError(''), setName(null))}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {past.length > 0 && (
        <ul className="reading-history">
          {past.map((l) => (
            <li key={l.id}>
              {loanText(l, loans.borrowers)}{' '}
              <button
                className="link"
                disabled={busy}
                onClick={() => confirm('Remove this loan from the history?') && run(() => loans.remove(l))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {out && (
        <button
          className="link"
          disabled={busy}
          onClick={() => confirm('Lent by mistake? This removes the loan, as if it never went out.') && run(() => loans.remove(out))}
        >
          Lent by mistake
        </button>
      )}
    </section>
  )
}

export default BookLending
