// The scan queue (step 7b): which kept scans still wait, and which need a lookup.
// Made-up ISBNs only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { needsLookup, waitingScans } from '../src/scanQueue.js'

describe('scan queue', () => {
  const copies = [{ isbn13: '9780000000019', isbn10: null }]

  test('kept until added, skipped or removed', () => {
    const scans = [
      { isbn: '9780000000026', queued: true },
      { isbn: '9780000000019', queued: true }, // added since
      { isbn: '9780000000033', queued: true, skipped: true },
      { isbn: '9780000000040' }, // scanned with signal: not kept
    ]
    assert.deepEqual(
      waitingScans(scans, copies).map((s) => s.isbn),
      ['9780000000026'],
    )
  })

  test('looked up when never tried or when it failed, not while looking or once done', () => {
    assert.equal(needsLookup({ queued: true }), true, 'kept from before')
    assert.equal(needsLookup({ queued: true, lookup: { status: 'waiting' } }), true)
    assert.equal(needsLookup({ queued: true, lookup: { status: 'error' } }), true)
    assert.equal(needsLookup({ queued: true, lookup: { status: 'looking' } }), false)
    assert.equal(needsLookup({ queued: true, lookup: { status: 'done' } }), false)
    assert.equal(needsLookup({ lookup: { status: 'error' } }), false, 'not queued')
  })
})
