// The phone's saved copy of what the app loads (the catalog, the wishlist,
// reading marks, loans), so it opens with no signal (Phase 2 step 7a).
//
// Kept in IndexedDB, the browser's own database on the phone: the simpler
// storage box (localStorage) holds only about 5 MB, less than the catalog.
// Every step may fail (a private window, a full phone): the app then just
// loads from the internet as it always did.

const DB_NAME = 'home-library'
const STORE = 'saved'

let opening = null
function openDb() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

// One read or write, finished when the browser says it's stored.
async function run(mode, act) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = act(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// -> { value, syncedAt } (syncedAt: when it last came from the database), or null.
export async function readSaved(key) {
  try {
    return (await run('readonly', (store) => store.get(key))) ?? null
  } catch {
    return null
  }
}

export async function writeSaved(key, entry) {
  try {
    await run('readwrite', (store) => store.put(entry, key))
  } catch {
    // Not saved this time; the next load tries again.
  }
}

// Signing out empties it, so the next person on this phone doesn't see the
// last one's reading history.
export async function clearSaved() {
  try {
    await run('readwrite', (store) => store.clear())
  } catch {
    // Nothing saved, or the browser won't say; either way nothing to show.
  }
}
