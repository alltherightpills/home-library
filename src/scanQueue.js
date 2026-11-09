// The scan queue (Phase 2 step 7b): books scanned when they couldn't be looked
// up (no signal), kept on the phone until each is added, skipped or removed
// (owner's choice, 2026-11-09), and looked up once there's signal again.
// Only the ISBNs are kept, in the phone's small storage box (localStorage).
// No database here, so tests can use it.
import { copiesWithIsbn } from './isbn.js'

const keyFor = (userId) => `scanQueue:${userId}`

// The kept scans, as entries for Scan's list (looked up again when Scan opens).
export function loadQueue(userId) {
  try {
    const isbns = JSON.parse(localStorage.getItem(keyFor(userId)))
    return Array.isArray(isbns) ? isbns.map((isbn) => ({ isbn, queued: true })) : []
  } catch {
    return []
  }
}

export function saveQueue(userId, isbns) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(isbns))
  } catch {
    // Not kept this time; the next change tries again.
  }
}

// The queued scans still to deal with: not added since, skipped or removed.
export const waitingScans = (scans, copies) =>
  scans.filter((s) => s.queued && !s.skipped && !copiesWithIsbn(copies, s.isbn).length)

// A queued scan that still needs its lookup: never tried, or it failed.
export const needsLookup = (scan) => Boolean(scan.queued && (!scan.lookup || ['waiting', 'error'].includes(scan.lookup.status)))
