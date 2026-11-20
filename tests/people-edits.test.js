import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicatePerson, formPeople, nameChanged, planPeople, rolesFor } from '../src/peopleEdits.js'

const person = (id, sort_name, role = 'Author', position = 0) => ({ role, position, author: { id, sort_name } })
const people = [person('a1', 'Ashley, Mike', 'Author', 0), person('a2', 'Poe, Edgar Allan', 'Author', 1)]

test('an untouched form changes nothing', () => {
  assert.deepEqual(planPeople(people, formPeople(people)), { remove: [], change: [], add: [] })
})

test('a role change keeps the person', () => {
  const rows = formPeople(people)
  rows[0].role = 'Editor'
  rows[1].role = 'Contributor'
  const plan = planPeople(people, rows)
  assert.deepEqual(plan.remove, [])
  assert.deepEqual(
    plan.change.map((c) => [c.saved.authorId, c.role, c.renamed]),
    [['a1', 'Editor', false], ['a2', 'Contributor', false]],
  )
})

test('a rename is a change too', () => {
  const rows = formPeople(people)
  rows[1].first = 'Edgar A.'
  const [change] = planPeople(people, rows).change
  assert.equal(change.renamed, true)
  assert.equal(change.first, 'Edgar A.')
})

test('removed rows are removed; new rows are added after the others; blank new rows are ignored', () => {
  const rows = [formPeople(people)[0], { last: 'Grimm', first: 'Jacob', role: 'Author', saved: null }, { last: ' ', first: '', role: 'Author', saved: null }]
  const plan = planPeople(people, rows)
  assert.deepEqual(plan.remove, [{ authorId: 'a2', role: 'Author' }])
  assert.deepEqual(plan.add, [{ last: 'Grimm', first: 'Jacob', role: 'Author', position: 2 }])
})

test('a book with nobody: new people start at position 0', () => {
  const plan = planPeople([], [{ last: 'DK', first: '', role: 'Author', saved: null }])
  assert.deepEqual(plan.add, [{ last: 'DK', first: '', role: 'Author', position: 0 }])
})

test('the same person twice in the same role is refused', () => {
  const rows = [
    { last: 'Grimm', first: 'Jacob', role: 'Author', saved: null },
    { last: 'grimm ', first: 'jacob', role: 'Author', saved: null },
  ]
  assert.equal(duplicatePerson(rows), 'jacob grimm is listed twice as Author.')
  rows[1].role = 'Editor'
  assert.equal(duplicatePerson(rows), '')
})

test('only new or renamed people get the "in your library" note', () => {
  const [ashley] = formPeople(people)
  assert.equal(nameChanged(ashley), false)
  assert.equal(nameChanged({ ...ashley, role: 'Editor' }), false)
  assert.equal(nameChanged({ ...ashley, first: 'Michael' }), true)
  assert.equal(nameChanged({ last: 'Grimm', first: '', role: 'Author', saved: null }), true)
})

test('a rarer role a book already has stays on offer', () => {
  assert.ok(rolesFor('Primary Contributor').includes('Primary Contributor'))
  assert.equal(rolesFor('Editor').length, rolesFor('Author').length)
})
