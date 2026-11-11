// One-time fix for the owner's 40-volume Yale Shakespeare (Yale University
// Press), which LibraryThing had as whatever edition a title search turned up.
// The details below were read from the owner's photos of each volume's title
// page, copyright page and last numbered page (2026-11-11).
//
//   npm run yale              (shows the plan; saves nothing)
//   npm run yale -- --apply   (the same, then asks; needs a fresh backup)
//
// Each copy gets: no ISBN, publisher Yale University Press, the printing year in
// hand as the edition year, pages, Hardcover, the editors and printing history
// in the edition note, publisher's series "Yale Shakespeare" with its volume
// number (in place of any other), the shared cover photo (one file per copy, so
// replacing one cover never removes another's), acquired 2004 in Greenville, IL,
// and walked today. The edition's own LC call number goes; the play's subjects stay.
//
// Two records were the wrong book: "Henry VI Part 1" (a second copy of 1 Henry
// VI) is really 1 Henry IV, so it gets its own work; "Shakespeare's Stratford"
// (a DVD record, "Various (Actor)") is Tucker Brooke's handbook. The 2 Henry VI
// work also loses its long imported title.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_ROOT, BOOK_TABLES, SNAPSHOT_NAME, fetchTable } from './lib/catalog.mjs'
import { ask, signIn } from './lib/session.mjs'

const COVER = new URL('../yale-photos/cover.jpg', import.meta.url)
const SERIES = 'Yale Shakespeare'
const PLACE = { acquired_year: 2004, acquired_city: 'Greenville', acquired_region: 'IL', acquired_country: 'USA' }

// [volume, copy title now, editors, edition year, pages, printing history]
const VOLUMES = [
  [1, "All's Well That Ends Well", 'Arthur E. Case', 1965, 140, 'Copyright 1926; third printing, March 1965'],
  [2, 'Antony and Cleopatra', 'Peter G. Phialas', 1965, 171, 'First published July 1921; revised edition, July 1955; fifth printing, June 1965'],
  [3, 'As You Like It', 'S. C. Burchell', 1965, 121, 'First published October 1919; revised edition, February 1954; second printing, August 1965'],
  [4, 'The Comedy of Errors', 'Robert Dudley French', 1965, 96, 'Copyright 1926; fourth printing, March 1965'],
  [5, 'Coriolanus', 'Tucker Brooke', 1957, 182, 'First published May 1924; sixth printing, November 1957'],
  [6, 'Cymbeline', 'Samuel B. Hemingway', 1961, 166, 'First published March 1924; second printing, February 1961'],
  [7, 'Hamlet', 'Tucker Brooke and Jack Randall Crawford', 1966, 222, 'First published November 1917; revised edition, February 1947; 13th printing, February 1966'],
  [8, 'Henry VI Part 1', 'Tucker Brooke and Samuel B. Hemingway', 1965, 169, 'First published September 1917; revised edition, August 1947; fifth printing, March 1965'],
  [9, 'King Henry IV, Part 2', 'Samuel B. Hemingway', 1965, 160, 'Copyright 1921; sixth printing, August 1965'],
  [10, 'Henry V', 'R. J. Dorius', 1961, 166, 'First published September 1918; revised edition, October 1955; third printing, March 1961'],
  [11, 'Henry VI, Part 1', 'Tucker Brooke', 1961, 160, 'First published December 1918; second printing, July 1949; third printing, February 1961'],
  [12, 'Henry VI, Part 2', 'Tucker Brooke', 1923, 166, 'First published 1923 (London: Humphrey Milford, Oxford University Press)'],
  [13, 'Henry VI, Part 3', 'Tucker Brooke', 1923, 149, 'Copyright 1923; printing undated'],
  [14, 'Henry VIII', 'John M. Berdan and Tucker Brooke', 1959, 166, 'First published September 1925; second printing, October 1959'],
  [15, 'Julius Caesar', 'Lawrence Mason', 1957, 129, 'First published May 1919; tenth printing, September 1957'],
  [16, 'King John', 'Stanley T. Williams', 1965, 144, 'Copyright 1927; second printing, March 1965'],
  [17, 'King Lear', 'Tucker Brooke and William Lyon Phelps', 1963, 202, 'Copyright 1917, 1947; new edition; eighth printing, December 1963'],
  [18, "Love's Labour's Lost", 'Wilbur L. Cross and Tucker Brooke', 1960, 153, 'First published April 1925; second printing, August 1954; third printing, May 1960'],
  [19, 'Macbeth', 'Eugene M. Waith', 1966, 188, 'Copyright 1918, 1954; revised edition, March 1954; eighth printing, February 1966'],
  [20, 'Measure for Measure', 'Davis Harding', 1954, 181, 'First published October 1926; revised edition, October 1954'],
  [21, 'The Merchant of Venice', 'William Lyon Phelps', 1950, 120, 'First published February 1923; fifth printing, September 1950'],
  [22, 'The Merry Wives of Windsor', 'George Van Santvoord', 1922, 184, 'Copyright 1922; printing undated'],
  [23, "A Midsummer Night's Dream", 'Willard Higley Durham', 1965, 96, 'Copyright 1918; ninth printing, August 1965'],
  [24, 'Much Ado About Nothing', 'Tucker Brooke', 1965, 188, 'Copyright 1917; eighth printing, November 1965'],
  [25, 'Othello', 'Tucker Brooke and Lawrence Mason', 1965, 188, 'Copyright 1918, 1947; new edition, 1947; eleventh printing, November 1965'],
  [26, 'Pericles Prince of Tyre', 'Alfred R. Bellinger', 1965, 139, 'Copyright 1925; second printing, September 1965'],
  [27, 'Richard II', 'Robert T. Petersson', 1965, 163, 'First published May 1921; revised edition, November 1957; fourth printing, March 1965'],
  [28, 'Richard III', 'Jack R. Crawford', 1965, 207, 'Copyright 1927; fifth printing, March 1965'],
  [29, 'Romeo and Juliet', 'Richard Hosley', 1965, 174, 'First published September 1917; revised edition, June 1954; fifth printing, March 1965'],
  [30, 'The Taming of the Shrew', 'Thomas G. Bergin', 1965, 125, 'First published 1921; revised edition, March 1954; second printing, March 1965'],
  [31, 'The Tempest', 'David Horne', 1955, 105, 'First published August 1918; revised edition, November 1955'],
  [32, 'Timon of Athens', 'Stanley T. Williams', 1966, 141, 'Copyright 1919; second printing, February 1966'],
  [33, 'Titus Andronicus', 'A. M. Witherspoon', 1926, 156, 'Copyright 1926 (London: Humphrey Milford, Oxford University Press)'],
  [34, 'Troilus and Cressida', 'Jackson J. Campbell', 1965, 169, 'Copyright 1927, 1956; revised edition, March 1965; third printing, November 1965'],
  [35, 'Twelfth Night', 'William P. Holden', 1965, 144, 'First published January 1922; revised edition, February 1954; second printing, March 1965'],
  [36, 'The Two Gentlemen of Verona', 'Karl Young', 1966, 105, 'Copyright 1924; third printing, February 1966'],
  [37, "The Winter's Tale", 'Frederick E. Pierce', 1918, 148, 'Copyright 1918; printing undated'],
  [38, "The Sonnets and a Lover's Complaint", 'Edward Bliss Reed', 1965, 107, 'Copyright 1923; fifth printing, August 1965'],
  [39, 'The Narrative Poems', 'Albert Feuillerat', 1966, 198, 'Copyright 1927; second printing, February 1966'],
  [40, "Shakespeare's Stratford", null, 1947, 177, 'A handbook for students. First published February 1926; second printing, August 1934; third printing, December 1947'],
]

// Records that were the wrong book: new title (copy and work); its LC details
// belonged to the other book, so they go.
const RETITLE = {
  'Henry VI Part 1': { title: 'King Henry IV, Part 1', ownWork: true },
  "Shakespeare's Stratford": { title: 'Shakespeare of Stratford', author: { display_name: 'Tucker Brooke', sort_name: 'Brooke, Tucker' }, firstPublished: 1926 },
}
const RENAME_WORK = { 'Henry VI, Part 2': 'Henry VI, Part 2' } // copy title → work title

const applying = process.argv.includes('--apply')
const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local

const { supabase, libraryId } = await signIn()
const read = (name) => fetchTable(supabase, BOOK_TABLES.find((t) => t.name === name), libraryId)
const [copies, works, credits, authors, pubSeries] = await Promise.all(
  ['copies', 'works', 'work_authors', 'authors', 'publisher_series'].map(read),
)
const workById = new Map(works.map((w) => [w.id, w]))
const series = pubSeries.find((s) => s.name === SERIES)
if (!series) throw new Error(`No publisher's series named "${SERIES}". Nothing was changed.`)

// Find each volume's copy by its exact title; stop if any is missing or ambiguous.
const plan = []
const problems = []
for (const [volume, title, editors, year, pages, history] of VOLUMES) {
  const matches = copies.filter((c) => c.title === title)
  if (matches.length !== 1) problems.push(`v. ${volume} "${title}": ${matches.length} copies have this title`)
  else plan.push({ volume, copy: matches[0], editors, year, pages, history })
}
if (problems.length) throw new Error(`Can't match every volume, so nothing was changed:\n  ${problems.join('\n  ')}`)

const note = ({ editors, history }) => (editors ? `Edited by ${editors}. ${history}.` : `${history}.`)
console.log(`The Yale Shakespeare: ${plan.length} copies. Each gets publisher Yale University Press, no ISBN, Hardcover,`)
console.log(`the cover photo, acquired 2004 in Greenville, IL, and walked ${today}.\n`)
for (const p of plan) {
  const fix = RETITLE[p.copy.title]
  const name = fix ? `${p.copy.title} → ${fix.title}` : p.copy.title
  console.log(`v. ${String(p.volume).padStart(2)}  ${name}  ·  ${p.year}  ·  ${p.pages} pp.`)
  console.log(`        ${note(p)}`)
}
if (!applying) {
  console.log('\nNothing was saved. To save this, run the backup, then add --apply.')
  process.exit(0)
}

// The way back is a restore, so the newest backup must have these copies as they are now.
const snapshot = (await readdir(BACKUP_ROOT)).filter((n) => SNAPSHOT_NAME.test(n)).sort().at(-1)
if (!snapshot) throw new Error('No backup found. Run npm run backup first. Nothing was changed.')
const backedUp = new Map(JSON.parse(await readFile(join(BACKUP_ROOT, snapshot, 'copies.json'), 'utf8')).map((c) => [c.id, c]))
const changed = plan.filter(({ copy }) => backedUp.get(copy.id)?.updated_at !== copy.updated_at)
if (changed.length) {
  throw new Error(`${changed.length} of these copies changed since backup ${snapshot}. Run npm run backup first. Nothing was changed.`)
}

const answer = await ask(`\nThe way back is backup ${snapshot}. Type YALE to save all ${plan.length}: `)
if (answer.trim() !== 'YALE') {
  console.log('Nothing was changed.')
  process.exit(0)
}

const cover = await readFile(COVER)
const fail = (what, error) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

for (const p of plan) {
  const { copy } = p
  const fix = RETITLE[copy.title]
  const label = `v. ${p.volume} "${copy.title}"`

  // Its own cover file, named like the app's photo uploads.
  const path = `${libraryId}/${copy.id}-${Date.now()}.jpg`
  fail(`${label}, uploading the cover`, (await supabase.storage.from('covers').upload(path, cover, { contentType: 'image/jpeg' })).error)
  const coverUrl = supabase.storage.from('covers').getPublicUrl(path).data.publicUrl

  const changes = {
    isbn13: null,
    isbn10: null,
    publisher: 'Yale University Press',
    edition_year: p.year,
    pages: p.pages,
    binding: 'Hardcover',
    edition_note: note(p),
    lc_call_number: null,
    cover_id: null,
    cover_url: coverUrl,
    cover_source: 'photo',
    ...PLACE,
    shelf_walked_on: today,
  }
  if (fix) Object.assign(changes, { title: fix.title, lcc: null, lc_subjects: [], subjects: [], needs_review: false, review_note: null })

  if (fix?.ownWork) {
    // A new work with the same authors, as works-split does.
    const old = workById.get(copy.work_id)
    const { data: work, error } = await supabase
      .from('works')
      .insert({ library_id: libraryId, title: fix.title, original_language: old.original_language })
      .select('id')
      .single()
    fail(`${label}, adding its work`, error)
    const theirs = credits.filter((c) => c.work_id === old.id)
    const rows = theirs.map(({ author_id, role, position }) => ({ library_id: libraryId, work_id: work.id, author_id, role, position }))
    fail(`${label}, adding its authors`, (await supabase.from('work_authors').insert(rows)).error)
    changes.work_id = work.id
  } else if (fix?.author) {
    // Retitle the work and make Tucker Brooke its only author.
    let author = authors.find((a) => a.sort_name === fix.author.sort_name)
    if (!author) {
      const { data, error } = await supabase.from('authors').insert({ library_id: libraryId, ...fix.author }).select('id').single()
      fail(`${label}, adding ${fix.author.display_name}`, error)
      author = data
    }
    fail(`${label}, removing the old credits`, (await supabase.from('work_authors').delete().eq('work_id', copy.work_id)).error)
    const credit = { library_id: libraryId, work_id: copy.work_id, author_id: author.id, role: 'Author', position: 0 }
    fail(`${label}, crediting ${fix.author.display_name}`, (await supabase.from('work_authors').insert(credit)).error)
    const work = { title: fix.title, first_published_year: fix.firstPublished, first_published_source: null } // "entered by hand"
    fail(`${label}, retitling the work`, (await supabase.from('works').update(work).eq('id', copy.work_id)).error)
  } else if (RENAME_WORK[copy.title]) {
    fail(`${label}, renaming the work`, (await supabase.from('works').update({ title: RENAME_WORK[copy.title] }).eq('id', copy.work_id)).error)
  }

  fail(`${label}, saving`, (await supabase.from('copies').update(changes).eq('id', copy.id)).error)

  // Its publisher's series: Yale Shakespeare with the volume number, and no other.
  fail(`${label}, clearing its publisher's series`, (await supabase.from('copy_publisher_series').delete().eq('copy_id', copy.id)).error)
  const link = { library_id: libraryId, copy_id: copy.id, publisher_series_id: series.id, number: String(p.volume), position: 0 }
  fail(`${label}, adding Yale Shakespeare`, (await supabase.from('copy_publisher_series').insert(link)).error)

  // A replaced photo is no longer used anywhere (none expected here).
  const oldPhoto = copy.cover_source === 'photo' && copy.cover_url?.split('/object/public/covers/')[1]
  if (oldPhoto) await supabase.storage.from('covers').remove([oldPhoto])
  console.log(`${label}: done.`)
}

// Read back and check.
const [copiesNow, linksNow] = await Promise.all(['copies', 'copy_publisher_series'].map(read))
const wrong = plan.filter((p) => {
  const now = copiesNow.find((c) => c.id === p.copy.id)
  const links = linksNow.filter((l) => l.copy_id === p.copy.id)
  return (
    !now ||
    now.isbn13 ||
    now.edition_year !== p.year ||
    now.pages !== p.pages ||
    now.cover_source !== 'photo' ||
    now.shelf_walked_on !== today ||
    links.length !== 1 ||
    links[0].publisher_series_id !== series.id ||
    links[0].number !== String(p.volume)
  )
})
if (wrong.length) throw new Error(`Didn't check out: ${wrong.map((p) => `v. ${p.volume}`).join(', ')}`)
console.log(`\nSaved and checked: all ${plan.length} volumes.`)
