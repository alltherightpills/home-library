import { dateText, today } from './dates.js'
import { supabase } from './supabase.js'
import { useSaved } from './useSaved.js'

export { dateText }

// The signed-in person's reading history. The database only ever returns and
// changes their own rows, so a family member's reading never shows up here.

const COLUMNS = 'id, copy_id, borrowed, title, author, isbn, cover_url, borrowed_from, status, started_on, ended_on, created_at'
const PAGE = 1000 // the most rows the server returns per request

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// Every reading.
async function fetchReadings() {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('readings').select(COLUMNS).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all.push(...data)
    if (data.length < PAGE) return all
  }
}

// Saved on the phone too, so the ✓ and the Read filter work with no signal
// (see useSaved.js). The saved copy is this person's own, by `userId`.
export function useReadings(userId, refreshTick) {
  const saved = useSaved(`${userId}:readings`, fetchReadings, refreshTick)
  const list = saved.value // null while loading
  const error = saved.error
  const setList = saved.update

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

  return { list, error, start, startBorrowed, markRead, end, update, remove, reload: saved.refresh }
}

// One copy's readings, newest first.
export function readingsOf(list, copyId) {
  return (list ?? [])
    .filter((r) => r.copy_id === copyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Read means finished at least once; set aside doesn't count.
export const hasRead = (readings) => readings.some((r) => r.status === 'finished')

// The copies counted as read: finished at least once, this copy or another
// copy of the same work (reading one edition reads them all).
export function readCopyIds(list, copies) {
  const finished = new Set((list ?? []).filter((r) => r.status === 'finished' && r.copy_id).map((r) => r.copy_id))
  const workOf = (c) => c.work?.id ?? `copy:${c.id}`
  const works = new Set(copies.filter((c) => finished.has(c.id)).map(workOf))
  return new Set(copies.filter((c) => works.has(workOf(c))).map((c) => c.id))
}

// Location: office books count in the library total and categories, but not
// in reading stats, the Read filter, the shelf walk, or (Phase 3) Pick for me.
export const atOffice = (c) => c.location === 'Office'
export const atHome = (c) => !atOffice(c)

// The Read filter on book lists: 'all', 'unread' or 'read', by each copy's
// `read`. Unread and Read show home books only.
export const byRead = (copies, filter) =>
  filter === 'all' ? copies : copies.filter((c) => atHome(c) && c.read === (filter === 'read'))

// The Location filter on book lists: 'all', 'home' or 'office'.
export const byLocation = (copies, filter = 'all') =>
  filter === 'all' ? copies : copies.filter((c) => atOffice(c) === (filter === 'office'))

// Both filters at once.
export const byFilters = (copies, readFilter, locationFilter) => byLocation(byRead(copies, readFilter), locationFilter)

// The words the filters put before "books": "unread", "office", "read home".
export const filterWords = (readFilter = 'all', locationFilter = 'all') =>
  [readFilter, locationFilter].filter((f) => f !== 'all').join(' ')

// "12 books", or "12 unread books" / "12 office books" with a filter on.
export const countText = (n, readFilter = 'all', locationFilter = 'all') => {
  const words = filterWords(readFilter, locationFilter)
  return `${n.toLocaleString()} ${words ? `${words} ` : ''}${n === 1 ? 'book' : 'books'}`
}

// One line of a book's reading history.
export function readingText(r) {
  const started = r.started_on && `started ${dateText(r.started_on)}`
  if (r.status === 'reading') return r.started_on ? `Reading since ${dateText(r.started_on)}` : 'Reading'
  const verb = r.status === 'finished' ? 'Finished' : 'Set aside'
  if (!r.ended_on) return r.status === 'finished' ? 'Read before (date not recorded)' : verb
  return [`${verb} ${dateText(r.ended_on)}`, started && `(${started})`].filter(Boolean).join(' ')
}
