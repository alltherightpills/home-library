import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bookFacts, catalogCopies, descriptionsByKey, parseReview, planSynopses, plainText, remainingBooks, reviewText } from '../src/assessmentBatch.js'

const categories = [
  { id: 'F', name: 'Fiction', parent_id: null, position: 1 },
  { id: 'FF', name: 'Fantasy', parent_id: 'F', position: 2 },
  { id: 'FM', name: 'Mystery', parent_id: 'F', position: 1 },
  { id: 'N', name: 'Nonfiction', parent_id: null, position: 2 },
  { id: 'NR', name: 'Reference', parent_id: 'N', position: 1 },
]

// Work ids look like the database's: 00000000-0000-0000-0000-000000000001…
const workId = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// A small backup: works 1…, one copy each (c1…), on the given shelves.
function backup(books) {
  const tables = { copies: [], works: [], authors: [{ id: 'a1', display_name: 'Ann Author' }], work_authors: [], book_categories: [], assessments: [], readings: [] }
  books.forEach(({ title, shelves = [['F', true]], audience = 'Adult', location = 'Home', isbn13 = null, read = false, answers = [] }, i) => {
    const work = workId(i + 1)
    const copy = `c${i + 1}`
    tables.works.push({ id: work, title, first_published_year: 2000, synopsis: null, synopsis_set_by: null })
    tables.copies.push({ id: copy, work_id: work, title, audience, location, isbn13, pages: 300, languages: ['English'], lt_genres: [], subjects: [], lc_subjects: [] })
    tables.work_authors.push({ work_id: work, author_id: 'a1', role: 'Author', position: 0 })
    for (const [category_id, is_main] of shelves) tables.book_categories.push({ copy_id: copy, category_id, is_main, removed: false })
    for (const [question, answer, set_by = 'claude'] of answers) tables.assessments.push({ work_id: work, question, answer, sure: true, set_by })
    if (read) tables.readings.push({ copy_id: copy, status: 'finished' })
  })
  return tables
}

const ALL_FOUR = [['international', 'domestic'], ['driven', 'plot'], ['pace', 'quick'], ['mood', 'light']]

test('the batch: unread adult home books missing an answer, grouped by category, then title', () => {
  const tables = backup([
    { title: 'Zebra Fantasy', shelves: [['F', true], ['FF', false]] },
    { title: 'A Mystery', shelves: [['F', true], ['FM', false]] },
    { title: 'Apple Fantasy', shelves: [['F', true], ['FF', false]] },
    { title: 'History', shelves: [['N', true]] },
    { title: 'Read already', read: true },
    { title: 'At the office', location: 'Office' },
    { title: 'Kids book', audience: 'Kids' },
    { title: 'A dictionary', shelves: [['N', true], ['NR', false]] },
    { title: 'All answered', answers: ALL_FOUR },
    { title: 'Half answered', answers: ALL_FOUR.slice(0, 2) },
    { title: 'No audience', audience: null },
  ])
  const copies = catalogCopies(tables)
  const titles = (audience) => remainingBooks(copies, { readings: tables.readings, categories, audience }).map((c) => c.work.title)
  assert.deepEqual(titles('adult'), ['A Mystery', 'Apple Fantasy', 'Zebra Fantasy', 'Half answered', 'No audience', 'History'])
  assert.deepEqual(titles('kids-teen'), ['Kids book'])
})

test('a description is read from any copy of the work, as plain text', () => {
  assert.equal(plainText('<b>Winner</b><br>A man &amp; his <i>house</i>.&nbsp;'), 'Winner\nA man & his house.')
  const tables = backup([{ title: 'Piranesi', isbn13: '9781' }])
  const descriptions = descriptionsByKey([
    { source: 'google', isbn: '9781', found: true, data: { volumeInfo: { description: '<p>A house of statues.</p>' } } },
    { source: 'openlibrary', isbn: '9781', found: true, data: {} },
  ])
  const copies = catalogCopies(tables)
  const facts = bookFacts(copies[0], { copies, categories, descriptions })
  assert.equal(facts.description, 'A house of statues.')
  assert.equal(facts.byline, 'Ann Author')
  assert.equal(facts.category, 'Fiction')
})

// A review file as Claude fills it in.
function filled(answerLine, synopsisLine = 'Synopsis: A man lives in a house of statues.', fix = '- Your fix:') {
  const tables = backup([{ title: 'Piranesi' }])
  const copies = catalogCopies(tables)
  const text = reviewText([bookFacts(copies[0], { copies, categories, descriptions: new Map() })], { batch: '01', snapshot: 'x' })
  return text.replace('Answers: TODO', answerLine).replace('Synopsis: TODO', synopsisLine).replace('- Your fix:', fix)
}

test('a filled-in review file gives answers and a synopsis', () => {
  const { answers, synopses, problems } = parseReview(filled('Answers: International · Character? · Slow (owner) · In between'))
  assert.deepEqual(problems, [])
  assert.deepEqual(
    answers.map(({ question, answer, sure, set_by }) => [question, answer, sure, set_by]),
    [
      ['international', 'international', true, 'claude'],
      ['driven', 'character', false, 'claude'],
      ['pace', 'slow', true, 'owner'],
      ['mood', 'in_between', true, 'claude'],
    ],
  )
  assert.equal(answers[0].work_id, workId(1))
  assert.deepEqual(synopses.map((s) => [s.work_id, s.synopsis, s.set_by]), [[workId(1), 'A man lives in a house of statues.', 'claude']])
})

test("'-' leaves an answer out; Doesn't apply is an answer; an owner's synopsis is marked", () => {
  const { answers, synopses, problems } = parseReview(filled("Answers: Domestic · Doesn't apply · - · Heavy", 'Synopsis: (owner) My own words.'))
  assert.deepEqual(problems, [])
  assert.deepEqual(answers.map((a) => a.answer), ['domestic', 'doesnt_apply', 'heavy'])
  assert.deepEqual(synopses.map((s) => [s.synopsis, s.set_by]), [['My own words.', 'owner']])
})

test('an unfinished or unfixed file is refused', () => {
  const problemsOf = (...args) => parseReview(filled(...args)).problems
  assert.match(parseReview(filled('Answers: TODO')).problems[0], /answers not written yet/)
  assert.match(problemsOf('Answers: Domestic · Plot · Quick · Light', 'Synopsis: TODO')[0], /synopsis not written yet/)
  assert.match(problemsOf('Answers: Domestic · Plot · Quick')[0], /3 answers, not 4/)
  assert.match(problemsOf('Answers: Domestic · Plot · Heavy · Light')[0], /"Heavy" isn't an answer to Pace/)
  assert.match(problemsOf('Answers: Domestic · Plot · Quick? (owner) · Light')[0], /owner's answers are sure/)
  assert.match(problemsOf('Answers: Domestic · Plot · Quick · Light', undefined, '- Your fix: mood heavy')[0], /fix is still/)
})

test("a synopsis never replaces the owner's, and one saved as it is is skipped", () => {
  const works = new Map([
    ['w1', { title: 'Mine', synopsis: 'My words.', synopsis_set_by: 'owner' }],
    ['w2', { title: 'Same', synopsis: 'Same words.', synopsis_set_by: 'claude' }],
    ['w3', { title: 'New', synopsis: null, synopsis_set_by: null }],
    ['w4', { title: 'Mine again', synopsis: 'Old words.', synopsis_set_by: 'owner' }],
  ])
  const plan = planSynopses(
    [
      { work_id: 'w1', synopsis: "Claude's words.", set_by: 'claude' },
      { work_id: 'w2', synopsis: 'Same words.', set_by: 'claude' },
      { work_id: 'w3', synopsis: 'Fresh.', set_by: 'claude' },
      { work_id: 'w4', synopsis: 'New words.', set_by: 'owner' },
      { work_id: 'gone', synopsis: 'Lost.', set_by: 'claude', title: 'Gone' },
    ],
    works,
  )
  assert.deepEqual(plan.save.map((s) => s.work_id), ['w3', 'w4'])
  assert.equal(plan.same, 1)
  assert.deepEqual(plan.keptOwners, ['Mine'])
  assert.deepEqual(plan.missing, ['Gone'])
})
