import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerCode, answerForm, answerWords, assessmentsByWork, planAnswerEdits } from '../src/assessments.js'

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

test('Edit a Book saves only changed answers, as the owner’s; a blank menu clears', () => {
  const rows = [
    { question: 'pace', answer: 'quick', sure: false, set_by: 'claude' },
    { question: 'mood', answer: 'heavy', sure: true, set_by: 'claude' },
    { question: 'driven', answer: 'plot', sure: true, set_by: 'claude' },
  ]
  const form = answerForm(rows)
  assert.deepEqual(form, { international: '', driven: 'plot', pace: 'quick', mood: 'heavy' })
  assert.deepEqual(planAnswerEdits(rows, form), { save: [], clear: [] })
  assert.deepEqual(planAnswerEdits(rows, { ...form, pace: 'slow', international: 'domestic', mood: '' }), {
    save: [
      { question: 'international', answer: 'domestic', sure: true, set_by: 'owner' },
      { question: 'pace', answer: 'slow', sure: true, set_by: 'owner' },
    ],
    clear: ['mood'],
  })
})
