// Manage › Authors: the list of people, the name box, and what a rename would do.
// Well-known names only; the copies hold just what these rules read.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { filterPeople, mergedContributors, nameForms, nameParts, pairKey, pairOf, peopleIn, possibleDuplicates, renamePlan } from '../src/authors.js'

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

describe('possible duplicates', () => {
  const osborneM = person('b1', 'Osborne, Mary', 'Mary Osborne')
  const osborneMP = person('b2', 'Osborne, Mary Pope', 'Mary Pope Osborne')
  const osborneW = person('b3', 'Osborne, Will', 'Will Osborne')
  const lewisLower = person('b4', 'lewis', 'lewis')
  const kafka = person('b5', 'Kafka, Franz', 'Franz Kafka')
  const brontëC = person('b6', 'Brontë, Charlotte', 'Charlotte Brontë')
  const bronteC = person('b7', 'Bronte, Charlotte', 'Charlotte Bronte')
  const all = peopleIn([
    copy('d1', [osborneM]),
    copy('d2', [osborneMP]),
    copy('d3', [osborneW]),
    copy('d4', [lewis], [lewisLower]),
    copy('d5', [lewisShort]),
    copy('d6', [kafka]),
    copy('d7', [brontëC]),
    copy('d8', [bronteC]),
  ])
  const names = (groups) => groups.map((g) => g.map((p) => p.author.sort_name))

  test('groups the same surname and first initial, ignoring accents; a single name joins its surname', () => {
    assert.deepEqual(names(possibleDuplicates(all)), [
      ['lewis', 'Lewis, C S', 'Lewis, C. S.'],
      ['Bronte, Charlotte', 'Brontë, Charlotte'],
      ['Osborne, Mary', 'Osborne, Mary Pope'],
    ])
  })

  test('a group leaves the list once every pair in it is checked as different', () => {
    const checked = new Set([pairKey('b1', 'b2')])
    assert.deepEqual(names(possibleDuplicates(all, checked)).map((g) => g[0]), ['lewis', 'Bronte, Charlotte'])
    // One pair of three checked: the group stays.
    const onePair = new Set([pairKey('a5', 'a6')])
    assert.equal(possibleDuplicates(all, onePair)[0].length, 3)
  })

  test('a pair has one key whichever way round', () => {
    assert.equal(pairKey('b2', 'b1'), pairKey('b1', 'b2'))
    assert.deepEqual(pairOf('b2', 'b1'), ['b1', 'b2'])
  })
})

describe('merging on screen', () => {
  const credit = (author, role, position) => ({ author, role, position })

  test("a merged person's credits become the kept person's", () => {
    const merged = mergedContributors([credit(lewisShort, 'Author', 0), credit(rabassa, 'Translator', 1)], lewis, ['a6'])
    assert.deepEqual(merged.map((c) => [c.author.id, c.role, c.position]), [['a5', 'Author', 0], ['a3', 'Translator', 1]])
  })

  test('a book crediting both ends up with one credit, at the earlier position', () => {
    const before = [credit(lewis, 'Author', 1), credit(lewisShort, 'Author', 0)]
    const merged = mergedContributors(before, lewis, ['a6'])
    assert.deepEqual(merged.map((c) => [c.author.id, c.position]), [['a5', 0]])
    assert.equal(before[0].position, 1, "the catalog's own rows aren't changed")
  })

  test('the same person in two roles keeps both', () => {
    const merged = mergedContributors([credit(lewis, 'Author', 0), credit(lewisShort, 'Illustrator', 1)], lewis, ['a6'])
    assert.equal(merged.length, 2)
  })
})
