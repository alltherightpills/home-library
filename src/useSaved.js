import { useEffect, useRef, useState } from 'react'
import { readSaved, writeSaved } from './savedCopy.js'
import { supabase } from './supabase.js'

// Loads something from the database with a saved copy on the phone (step 7a):
// shows the saved copy at once, then the fresh one when it arrives, and saves
// that. When the fresh load fails (no signal), the saved copy stays, with
// `failed` set and `syncedAt` saying when it was last fresh.
//
// `fetchFresh()` returns the value or throws; it's a function defined once
// (outside any component), or every screen update would load again. `refreshTick` changes when the
// app should load again (back in the app, signal back); `refresh()` does too.
// `update(fn)` changes the value after a save, like setState, and saves it.
export function useSaved(key, fetchFresh, refreshTick) {
  const [state, setState] = useState({ value: null, syncedAt: null, failed: false, error: '' })
  const [ownTick, setOwnTick] = useState(0)
  // Counts changes made on the phone, so a load that began before one doesn't undo it.
  const edits = useRef(0)
  const synced = useRef(null)
  const dirty = useRef(false)

  // The saved copy, unless the fresh one got here first.
  useEffect(() => {
    let cancelled = false
    readSaved(key).then((saved) => {
      if (cancelled || !saved) return
      setState((s) => {
        if (s.value !== null) return s
        synced.current = saved.syncedAt
        return { ...s, value: saved.value, syncedAt: saved.syncedAt, error: '' }
      })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  // The fresh copy, at launch and again on each refresh.
  useEffect(() => {
    let cancelled = false
    const editsBefore = edits.current
    signedInFetch(fetchFresh).then(
      (value) => {
        if (cancelled || edits.current !== editsBefore) return
        const now = new Date().toISOString()
        synced.current = now
        setState({ value, syncedAt: now, failed: false, error: '' })
        writeSaved(key, { value, syncedAt: now })
      },
      (err) => {
        if (cancelled) return
        // With a saved copy, only `failed`; with nothing to show, the error.
        setState((s) => ({ ...s, failed: true, error: s.value === null ? err.message : '' }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, fetchFresh, refreshTick, ownTick])

  // A change made on the phone, saved a second later (a burst of changes is one save).
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => {
      dirty.current = false
      writeSaved(key, { value: state.value, syncedAt: synced.current })
    }, 1000)
    return () => clearTimeout(timer)
  }, [key, state.value])

  function update(change) {
    edits.current += 1
    dirty.current = true
    setState((s) => ({ ...s, value: change(s.value) }))
  }

  return { ...state, update, refresh: () => setOwnTick((t) => t + 1) }
}

// With no signal, the sign-in pass can't be renewed, and a request without it
// gets an empty answer (the database's rules hide everything), not an error.
// So no pass, no load: the saved copy is never replaced by nothing.
// When the phone already knows it's offline, say so at once rather than after
// the database library's retries (about 7 seconds).
async function signedInFetch(fetchFresh) {
  if (navigator.onLine === false) throw new Error('No connection: no signal.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('No connection: couldn’t renew your sign-in.')
  return fetchFresh()
}

// "2:15 pm" today, otherwise "Nov 8, 2:15 pm": when the saved copy was fresh.
export function asOfText(iso, now = new Date()) {
  const when = new Date(iso)
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (when.toDateString() === now.toDateString()) return time
  return `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
