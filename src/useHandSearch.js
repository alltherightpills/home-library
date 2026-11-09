import { useState } from 'react'
import { bookFromPick, searchByHand } from './handLookup.js'

const BLANK = { title: '', author: '', year: '' }

// The search by title, author and year and its pick, shared by Add by hand and
// the Wishlist's Add a book by title (the screens are SearchStep and PickStep
// in AddByHand.jsx). `initial` fills in the boxes (I bought it, for a wish
// with no ISBN). Picking makes `book` and moves to the 'form' step, which each
// screen draws its own way.
export function useHandSearch(initial = BLANK) {
  const [typed, setTyped] = useState(initial)
  const [step, setStep] = useState('search') // search | pick | form | done
  const [search, setSearch] = useState(null)
  const [book, setBook] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const show = (next) => {
    setStep(next)
    window.scrollTo(0, 0)
  }
  const setTypedPart = (key) => (value) => setTyped((t) => ({ ...t, [key]: value }))

  async function runSearch(e) {
    e.preventDefault()
    if (!typed.title.trim()) return setError('Type at least the title.')
    if (typed.year.trim() && !/^\d{4}$/.test(typed.year.trim())) return setError('Year should be four digits, like 1952.')
    setBusy(true)
    setError('')
    try {
      setSearch(await searchByHand({ title: typed.title.trim(), author: typed.author.trim(), year: typed.year.trim() }))
      show('pick')
    } catch (err) {
      setError(`Couldn't search: ${err.message}`)
    }
    setBusy(false)
  }

  async function pick(choice) {
    setBusy(true)
    try {
      setBook(await bookFromPick(search, typed, choice))
      show('form')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setTyped(BLANK)
    setSearch(null)
    setBook(null)
    show('search')
  }

  return { typed, setTypedPart, step, show, search, book, busy, error, runSearch, pick, reset }
}
