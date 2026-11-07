// The A–Z strip on long lists: which letter each item files under, where each
// letter starts, and where a letter with nothing under it jumps.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MIN_ITEMS, letterOf, letterStarts, nearestLetter } from '../src/letters.js'

describe('the A–Z strip', () => {
  test('files under the first letter, ignoring accents, capitals and opening punctuation', () => {
    assert.equal(letterOf('Émile'), 'E')
    assert.equal(letterOf('le guin, ursula k.'), 'L')
    assert.equal(letterOf("'Salem's Lot"), 'S')
    assert.equal(letterOf('Øksendal'), 'O')
  })

  test('numbers, other alphabets and blanks file under #', () => {
    assert.equal(letterOf('1984'), '#')
    assert.equal(letterOf('Ἰλιάς'.normalize('NFC')), '#')
    assert.equal(letterOf(''), '#')
    assert.equal(letterOf(undefined), '#')
  })

  test('marks the first item under each letter', () => {
    const keys = ['1984', 'animal farm', 'anna karenina', 'beloved', ...Array(MIN_ITEMS).fill('zami')]
    assert.deepEqual([...letterStarts(keys)], [[0, '#'], [1, 'A'], [3, 'B'], [4, 'Z']])
  })

  test('a short list gets no strip', () => {
    assert.equal(letterStarts(Array(MIN_ITEMS - 1).fill('a')), null)
  })

  test('a letter with nothing under it jumps to the next one, or the last before it', () => {
    const present = new Set(['#', 'B', 'M'])
    assert.equal(nearestLetter('B', present), 'B')
    assert.equal(nearestLetter('C', present), 'M')
    assert.equal(nearestLetter('X', present), 'M')
    assert.equal(nearestLetter('A', new Set()), null)
  })
})
