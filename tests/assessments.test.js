import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerCode, answerWords, assessmentsByWork } from '../src/assessments.js'

test('answers read as words', () => {
  assert.equal(answerWords('in_between'), 'In between')
  assert.equal(answerWords('doesnt_apply'), "Doesn't apply")
  assert.equal(answerWords('quick'), 'Quick')
})

test('typed answers become stored codes', () => {
  assert.equal(answerCode('mood', 'In between'), 'in_between')
  assert.equal(answerCode('pace', "doesn't apply"), 'doesnt_apply')
  assert.equal(answerCode('pace', 'Doesn’t apply'), 'doesnt_apply')
  assert.equal(answerCode('driven', ' Narrative '), 'narrative')
  assert.equal(answerCode('international', 'Not assessed'), 'not_assessed')
})

test('an answer from another question, or no question, is refused', () => {
  assert.equal(answerCode('pace', 'Heavy'), null)
  assert.equal(answerCode('mood', '?'), null)
  assert.equal(answerCode('length', 'Short'), null)
})

test('answers group by work', () => {
  const rows = [
    { work_id: 'a', question: 'pace', answer: 'quick' },
    { work_id: 'a', question: 'mood', answer: 'light' },
    { work_id: 'b', question: 'pace', answer: 'slow' },
  ]
  const byWork = assessmentsByWork(rows)
  assert.equal(byWork.get('a').mood.answer, 'light')
  assert.equal(byWork.get('b').pace.answer, 'slow')
  assert.equal(byWork.get('c'), undefined)
})
