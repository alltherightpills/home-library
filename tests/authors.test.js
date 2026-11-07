// Manage › Authors: the list of people, the name box, and what a rename would do.
// Well-known names only; the copies hold just what these rules read.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { filterPeople, nameForms, nameParts, peopleIn, renamePlan } from '../src/authors.js'

const person = (id, sort_name, display_name) => ({ id, sort_name, display_name })
const leGuin = person('a1', 'Le Guin, Ursula K.', 'Ursula K. Le Guin')
const marquez = person('a2', 'García Márquez, Gabriel', 'Gabriel García Márquez')
const rabassa = person('a3', 'Rabassa, Gregory', 'Gregory Rabassa')
const homer = person('a4', 'Homer', 'Homer')
const lewis = person('a5', 'Lewis, C. S.', 'C. S. Lewis')
const lewisShort = person('a6', 'Lewis, C S', 'C S Lewis')

const copy = (id, ...credits) => ({ id, people: credits.map(([author, role = 'Author']) => ({ author, role })) })
const copies = [
  copy('c1', [leGuin]),
  copy('c2', [leGuin]),
  copy('c3', [marquez], [rabassa, 'Translator']),
  copy('c4', [homer]),
  copy('c5', [lewis]),
  copy('c6', [lewisShort]),
]
const people = peopleIn(copies)

describe('name forms', () => {
  test('splits a filed name at the comma', () => {
    assert.deepEqual(nameParts('Le Guin, Ursula K.'), { last: 'Le Guin', first: 'Ursula K.' })
    assert.deepEqual(nameParts('Homer'), { last: 'Homer', first: '' })
  })

  test('builds both forms from the two boxes, tidying spaces', () => {
    assert.deepEqual(nameForms(' Le  Guin ', 'Ursula K. '), { sort_name: 'Le Guin, Ursula K.', display_name: 'Ursula K. Le Guin' })
    assert.deepEqual(nameForms('Homer', '  '), { sort_name: 'Homer', display_name: 'Homer' })
  })
})

describe('the list of people', () => {
  test('lists each person once, A to Z, with their books and roles', () => {
    assert.deepEqual(
      people.map((p) => p.author.sort_name),
      ['García Márquez, Gabriel', 'Homer', 'Le Guin, Ursula K.', 'Lewis, C S', 'Lewis, C. S.', 'Rabassa, Gregory'],
    )
    const ursula = people.find((p) => p.author.id === 'a1')
    assert.equal(ursula.books.length, 2)
    assert.deepEqual(people.find((p) => p.author.id === 'a3').roles, ['Translator'])
  })

  test('the name box ignores accents and capitals, and matches either form', () => {
    assert.deepEqual(filterPeople(people, 'garcia').map((p) => p.author.id), ['a2'])
    assert.deepEqual(filterPeople(people, 'ursula le').map((p) => p.author.id), ['a1'])
    assert.equal(filterPeople(people, '  ').length, people.length)
  })
})

describe('renaming', () => {
  test('a new name shows both forms', () => {
    const plan = renamePlan(people, homer, { last: 'Homer', first: 'Blind' })
    assert.deepEqual(plan.forms, { sort_name: 'Homer, Blind', display_name: 'Blind Homer' })
    assert.equal(plan.same, null)
    assert.equal(plan.alike, null)
  })

  test('the same name again is no change', () => {
    assert.equal(renamePlan(people, leGuin, { last: 'Le Guin', first: 'Ursula K.' }).unchanged, true)
  })

  test('a blank last name is a problem', () => {
    assert.ok(renamePlan(people, homer, { last: ' ', first: 'Ursula' }).problem)
  })

  test("someone else's exact name is a merge, not a rename", () => {
    const plan = renamePlan(people, lewisShort, { last: 'Lewis', first: 'C. S.' })
    assert.equal(plan.same, lewis)
  })

  test('a name differing only in punctuation or accents is flagged as alike', () => {
    assert.equal(renamePlan(people, homer, { last: 'Lewis', first: 'C.S' }).alike, lewisShort)
    assert.equal(renamePlan(people, homer, { last: 'Garcia Marquez', first: 'Gabriel' }).alike, marquez)
  })

  test('fixing your own capitals or accents is allowed', () => {
    const plan = renamePlan(people, marquez, { last: 'García Márquez', first: 'Gabriel José' })
    assert.equal(plan.same, null)
    assert.equal(plan.alike, null)
  })
})
