import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { tidyNote, wishFromBook } from './wishlist.js'

// The household's wishlist, loaded once when the app opens (a short list, so
// one request is plenty). Shared by every member, like lending.

const COLUMNS = 'id, title, authors, isbn13, work_key, cover_url, note, added_on, created_at'

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export function useWishlist() {
  const [state, setState] = useState({ list: null, error: '' }) // null while loading

  useEffect(() => {
    let cancelled = false
    supabase
      .from('wishlist')
      .select(COLUMNS)
      .then(({ data, error }) => !cancelled && setState(error ? { list: null, error: error.message } : { list: data, error: '' }))
    return () => {
      cancelled = true
    }
  }, [])

  // Adds a book Scan found (see wishFromBook), with an optional note.
  async function add(book, isbn13, note, libraryId) {
    const { data, error } = await supabase.from('wishlist').insert(wishFromBook(book, isbn13, note, libraryId)).select(COLUMNS).single()
    // 23505: the database's "already there" (one wish per ISBN).
    if (error?.code === '23505') throw new Error('This edition is already on your wishlist.')
    check(error, 'Adding to the wishlist')
    setState((s) => ({ ...s, list: [...s.list, data] }))
  }

  async function setNote(wish, note) {
    const { data, error } = await supabase.from('wishlist').update({ note: tidyNote(note) }).eq('id', wish.id).select(COLUMNS).single()
    check(error, 'Saving the note')
    setState((s) => ({ ...s, list: s.list.map((w) => (w.id === data.id ? data : w)) }))
  }

  async function remove(wish) {
    const { error } = await supabase.from('wishlist').delete().eq('id', wish.id)
    check(error, 'Removing')
    setState((s) => ({ ...s, list: s.list.filter((w) => w.id !== wish.id) }))
  }

  return { ...state, add, setNote, remove }
}
