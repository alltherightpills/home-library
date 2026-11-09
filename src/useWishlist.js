import { supabase } from './supabase.js'
import { useSaved } from './useSaved.js'
import { tidyNote, wishFromBook } from './wishlist.js'

// The household's wishlist (a short list, so one request is plenty). Shared by
// every member, like lending. Saved on the phone with the catalog, so "★ On
// your wishlist" works in a bookstore with no signal (see useSaved.js).

const COLUMNS = 'id, title, authors, isbn13, work_key, cover_url, note, added_on, created_at'

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

async function fetchWishlist() {
  const { data, error } = await supabase.from('wishlist').select(COLUMNS)
  if (error) throw new Error(error.message)
  return data
}

export function useWishlist(userId, refreshTick) {
  const saved = useSaved(`${userId}:wishlist`, fetchWishlist, refreshTick)
  const setList = saved.update

  // Adds a book Scan found (see wishFromBook), with an optional note.
  async function add(book, isbn13, note, libraryId) {
    const { data, error } = await supabase.from('wishlist').insert(wishFromBook(book, isbn13, note, libraryId)).select(COLUMNS).single()
    // 23505: the database's "already there" (one wish per ISBN).
    if (error?.code === '23505') throw new Error('This edition is already on your wishlist.')
    check(error, 'Adding to the wishlist')
    setList((list) => [...list, data])
  }

  async function setNote(wish, note) {
    const { data, error } = await supabase.from('wishlist').update({ note: tidyNote(note) }).eq('id', wish.id).select(COLUMNS).single()
    check(error, 'Saving the note')
    setList((list) => list.map((w) => (w.id === data.id ? data : w)))
  }

  async function remove(wish) {
    const { error } = await supabase.from('wishlist').delete().eq('id', wish.id)
    check(error, 'Removing')
    setList((list) => list.filter((w) => w.id !== wish.id))
  }

  return { list: saved.value, error: saved.error, add, setNote, remove } // list: null while loading
}
