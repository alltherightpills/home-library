import { today } from './dates.js'
import { tidyName } from './lending.js'
import { supabase } from './supabase.js'
import { useSaved } from './useSaved.js'

// The household's borrowers and loans (a few a year, so one request each is
// plenty). Shared by every member, like the books. Saved on the phone with the
// catalog, so Lent marks show with no signal (see useSaved.js).

const LOAN_COLUMNS = 'id, copy_id, borrower_id, lent_on, returned_on, created_at'

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

async function fetchAll() {
  const [borrowers, loans] = await Promise.all([
    supabase.from('borrowers').select('id, name').order('name'),
    supabase.from('loans').select(LOAN_COLUMNS).order('lent_on'),
  ])
  const error = borrowers.error ?? loans.error
  if (error) throw new Error(error.message)
  return { borrowers: borrowers.data, loans: loans.data }
}

export function useLoans(userId, refreshTick) {
  const saved = useSaved(`${userId}:loans`, fetchAll, refreshTick)
  // borrowers and loans: null while loading.
  const state = { borrowers: null, loans: null, ...saved.value, error: saved.error }
  const setState = saved.update

  // Lends the copy to someone by name, dated today. The database adds a new
  // name to the borrowers and records the loan in one step (lend_copy).
  async function lend(copy, name) {
    const { data: loan, error } = await supabase.rpc('lend_copy', { lend_copy_id: copy.id, borrower_name: name, lent_on: today() })
    check(error, 'Lending')
    let { borrowers } = state
    if (!borrowers.some((b) => b.id === loan.borrower_id)) {
      const { data, error: nameError } = await supabase.from('borrowers').select('id, name').eq('id', loan.borrower_id).single()
      check(nameError, 'Loading the new name')
      borrowers = [...borrowers, data]
    }
    setState((s) => ({ ...s, borrowers, loans: [...s.loans, pick(loan)] }))
  }

  // The book is back, dated today.
  async function giveBack(loan) {
    const { data, error } = await supabase.from('loans').update({ returned_on: today() }).eq('id', loan.id).select(LOAN_COLUMNS).single()
    check(error, 'Saving')
    setState((s) => ({ ...s, loans: s.loans.map((l) => (l.id === data.id ? data : l)) }))
  }

  // Takes a loan out of the history (one entered by mistake).
  async function remove(loan) {
    const { error } = await supabase.from('loans').delete().eq('id', loan.id)
    check(error, 'Removing')
    setState((s) => ({ ...s, loans: s.loans.filter((l) => l.id !== loan.id) }))
  }

  // Renames someone on the list; every loan shows the new name, since loans
  // point at the person.
  async function rename(borrower, name) {
    const { data, error } = await supabase.from('borrowers').update({ name: tidyName(name) }).eq('id', borrower.id).select('id, name').single()
    // 23505: the database's "already taken" (names are unique, ignoring capitals).
    if (error?.code === '23505') throw new Error('Someone on your list already has that name.')
    check(error, 'Renaming')
    setState((s) => ({ ...s, borrowers: s.borrowers.map((b) => (b.id === data.id ? data : b)) }))
  }

  // Takes someone off the list. The database refuses while any loan names them.
  async function removeBorrower(borrower) {
    const { error } = await supabase.from('borrowers').delete().eq('id', borrower.id)
    // 23503: a loan still points at them.
    if (error?.code === '23503') throw new Error('They still have loans in the history, so they stay on the list.')
    check(error, 'Removing')
    setState((s) => ({ ...s, borrowers: s.borrowers.filter((b) => b.id !== borrower.id) }))
  }

  return { ...state, lend, giveBack, remove, rename, removeBorrower }
}

// The loan's columns the app keeps (lend_copy returns the whole row).
const pick = ({ id, copy_id, borrower_id, lent_on, returned_on, created_at }) => ({ id, copy_id, borrower_id, lent_on, returned_on, created_at })
