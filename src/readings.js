import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// The signed-in person's reading history. The database only ever returns and
// changes their own rows, so a family member's reading never shows up here.

const COLUMNS = 'id, copy_id, borrowed, title, author, isbn, cover_url, borrowed_from, status, started_on, ended_on, created_at'
const PAGE = 1000 // the most rows the server returns per request

const today = () => new Date().toLocaleDateString('en-CA')

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// Every reading, or an error message.
async function fetchReadings() {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('readings').select(COLUMNS).order('id').range(from, from + PAGE - 1)
    if (error) return { error: error.message }
    all.push(...data)
    if (data.length < PAGE) return { list: all }
  }
}

export function useReadings() {
  const [list, setList] = useState(null) // null while loading
  const [error, setError] = useState('')

  const show = (result) => {
    setError(result.error ?? '')
    if (result.list) setList(result.list)
  }

  useEffect(() => {
    let cancelled = false
    fetchReadings().then((result) => !cancelled && show(result))
    return () => {
      cancelled = true
    }
  }, [])

  const load = () => fetchReadings().then(show)

  async function insert(row) {
    const { data, error } = await supabase.from('readings').insert(row).select(COLUMNS).single()
    check(error, 'Saving')
    setList((all) => [...all, data])
  }

  // Starts a new reading of an owned copy (a reread is a new reading too).
  const start = (copy) =>
    insert({ library_id: copy.library_id, copy_id: copy.id, status: 'reading', started_on: today() })

  // Starts reading a book you don't own: { libraryId, title, author, isbn, coverUrl, borrowedFrom }.
  const startBorrowed = (book) =>
    insert({
      library_id: book.libraryId,
      borrowed: true,
      title: book.title,
      author: book.author || null,
      isbn: book.isbn,
      cover_url: book.coverUrl,
      borrowed_from: book.borrowedFrom || null,
      status: 'reading',
      started_on: today(),
    })

  // A past read with no dates, for books read before the app.
  const markRead = (copy) => insert({ library_id: copy.library_id, copy_id: copy.id, status: 'finished' })

  // Finishes or sets aside a current reading, dated today.
  const end = (reading, status) => update(reading, { status, ended_on: today() })

  // Saves changes to a reading (dates, or a borrowed book's title, author, cover).
  async function update(reading, changes) {
    const { data, error } = await supabase.from('readings').update(changes).eq('id', reading.id).select(COLUMNS).single()
    check(error, 'Saving')
    setList((all) => all.map((r) => (r.id === data.id ? data : r)))
  }

  async function remove(reading) {
    const { error } = await supabase.from('readings').delete().eq('id', reading.id)
    check(error, 'Removing')
    setList((all) => all.filter((r) => r.id !== reading.id))
  }

  return { list, error, start, startBorrowed, markRead, end, update, remove, reload: load }
}

// One copy's readings, newest first.
export function readingsOf(list, copyId) {
  return (list ?? [])
    .filter((r) => r.copy_id === copyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Read means finished at least once; set aside doesn't count.
export const hasRead = (readings) => readings.some((r) => r.status === 'finished')

// "Nov 2, 2026" from a stored "2026-11-02".
export const dateText = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

// One line of a book's reading history.
export function readingText(r) {
  const started = r.started_on && `started ${dateText(r.started_on)}`
  if (r.status === 'reading') return r.started_on ? `Reading since ${dateText(r.started_on)}` : 'Reading'
  const verb = r.status === 'finished' ? 'Finished' : 'Set aside'
  if (!r.ended_on) return r.status === 'finished' ? 'Read before (date not recorded)' : verb
  return [`${verb} ${dateText(r.ended_on)}`, started && `(${started})`].filter(Boolean).join(' ')
}
