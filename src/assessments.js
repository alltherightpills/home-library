// Pick for me's judged questions (6–9) and their answers, as stored in the
// `assessments` table: one row per work per question. The meaning of each
// answer is in assessment-guide.md, the standard every assessment pass
// follows; change that file first, then this list.
//
// Stored answers are short codes ('in_between'); `words` is how a person reads
// them. Two answers belong to every question: 'doesnt_apply' (pace for a
// reference book) and 'not_assessed' (a book too mixed to judge as one, like a
// literary magazine). Pick for me lets both through, like a missing answer.

export const QUESTIONS = [
  { id: 'international', label: 'International', answers: ['international', 'domestic'] },
  // Stories answer character / both / plot; nonfiction narrative / both / ideas.
  { id: 'driven', label: 'Driven', answers: ['character', 'both', 'plot', 'narrative', 'ideas'] },
  { id: 'pace', label: 'Pace', answers: ['quick', 'steady', 'slow'] },
  { id: 'mood', label: 'Mood', answers: ['light', 'in_between', 'heavy'] },
]

export const EVERY_QUESTION_ANSWERS = ['doesnt_apply', 'not_assessed']

const WORDS = { in_between: 'In between', doesnt_apply: "Doesn't apply", not_assessed: 'Not assessed' }

// 'in_between' → "In between"; 'quick' → "Quick".
export const answerWords = (answer) => WORDS[answer] ?? answer.charAt(0).toUpperCase() + answer.slice(1)

// "In between" (or "in between", "Doesn't apply") → 'in_between'; null if it
// isn't one of the question's answers.
export function answerCode(questionId, text) {
  const code = text.trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, '_')
  const question = QUESTIONS.find((q) => q.id === questionId)
  return question && [...question.answers, ...EVERY_QUESTION_ANSWERS].includes(code) ? code : null
}

// Edit a Book: a work's stored answers as the form's menus, question → answer
// code, '' for none.
export function answerForm(rows = []) {
  return Object.fromEntries(QUESTIONS.map((q) => [q.id, rows.find((r) => r.question === q.id)?.answer ?? '']))
}

// What Edit a Book saves: only the menus that changed. A changed answer
// becomes the owner's (and sure), which no assessment pass replaces; a menu
// set back to "Not answered" removes the answer.
export function planAnswerEdits(rows = [], form) {
  const before = answerForm(rows)
  const changed = QUESTIONS.map((q) => q.id).filter((id) => form[id] !== before[id])
  return {
    save: changed.filter((id) => form[id]).map((id) => ({ question: id, answer: form[id], sure: true, set_by: 'owner' })),
    clear: changed.filter((id) => !form[id]),
  }
}

// work id → { international: row, pace: row, … }
export function assessmentsByWork(rows) {
  const byWork = new Map()
  for (const row of rows) {
    if (!byWork.has(row.work_id)) byWork.set(row.work_id, {})
    byWork.get(row.work_id)[row.question] = row
  }
  return byWork
}
