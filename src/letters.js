// The rules behind the A–Z strip on long lists (src/LetterIndex.jsx): which
// letter each item files under, and where each letter starts. No screen code
// here, so tests can check them.

import { normalize } from './normalize.js'

// Top to bottom, as on the iPhone. Numbers and other characters sort before
// letters in these lists, so # comes first.
export const INDEX_LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

// Shorter lists fit on a screen or two and don't need the strip.
export const MIN_ITEMS = 30

// The letter a sort key files under, ignoring accents and opening punctuation:
// "Émile" → E, "Øksendal" → O, "'Salem's Lot" → S. Numbers and other alphabets → #.
export function letterOf(key) {
  const first = normalize(key ?? '').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

// Where each letter starts in a sorted list: Map(position → letter) for the
// first item under each letter. Null when the list is too short for the strip.
export function letterStarts(keys) {
  if (keys.length < MIN_ITEMS) return null
  const starts = new Map()
  const seen = new Set()
  keys.forEach((key, i) => {
    const letter = letterOf(key)
    if (seen.has(letter)) return
    seen.add(letter)
    starts.set(i, letter)
  })
  return starts
}

// A letter with nothing under it jumps to the next one that has something,
// or the last one before it at the end of the alphabet.
export function nearestLetter(letter, present) {
  const i = INDEX_LETTERS.indexOf(letter)
  return INDEX_LETTERS.slice(i).find((l) => present.has(l)) ?? INDEX_LETTERS.slice(0, i).findLast((l) => present.has(l)) ?? null
}
