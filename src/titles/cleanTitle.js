// Separates a book's real title from what booksellers add to it: series names,
// publisher's series, form labels ("A Novel"), edition notes, and award or
// promotional text. Shared by the report script and, later, Scan to add.

import { PHRASE_RULINGS, SERIES_NAMES, TITLE_SERIES } from './phrase-rulings.js'

// Award and promotional wording: always deleted.
const PROMO = /\b(winner|finalist|prize|awards?|notable book|book of the year|book club|bestsell\w*|best[- ]selling|perfect for|must[- ]read|fans\b|christmas present|now a |major motion|netflix|tiktok|oprah|gma\b|reese'?s)/i

// Labels for the form of a book, not a real subtitle: always deleted.
const FORM_LABEL = /^(an? )?(novel|novels|novella|memoir|poems|stories|short stories|essays|graphic novel|thriller|mystery|romance|biography|autobiography)$/i

// Notes about this printing rather than the title.
const EDITION_NOTE = /\b(\d+(st|nd|rd|th) (edition|anniversary)|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|new|revised|updated|expanded|deluxe|reissue|reprint|anniversary|book club|school & library binding|library binding|collector'?s|international|gift|special|critical|the \w+) edition|revised and expanded|anniversary|paperback|hardcover|reprint|unabridged|large print)\b|^\d{4}-\d{2}-\d{2}$/i

// Wording worth keeping in the title until the owner rules on it.
const MAYBE_KEEP = /\b(version|translation|translated|illustrated|annotated)\b/i

// Publishers' lines: a series statement, but not a set to read in order.
const PUBLISHER_SERIES = /\b(penguin (classics|epics|great ideas|twentieth|modern|drop)|penguin\b.*classics|twentieth[- ]century classics|modern library|vintage (classics|contemporaries|international|crime|books)|norton critical|norton library|folger|pelican shakespeare|arden shakespeare|oxford world|signet class|everyman|dover thrift|harper perennial|perennial classics|mentor|graphix|p\.s\.|reader's circle|new york review|nyrb|pantheon fairy tale|national poetry series|ng adventure classics|pocket canon|case studies in contemporary criticism|fsg classics|penguin (great loves|poets|american library|orange|red|clothbound)|bantam classics|puffin|signet|library of america|harvest book|new directions paperbook|scholastic gold|very short introductions|barnes & noble classics|british library|dover|hackett classics|new mermaids|new riverside|oxford shakespeare|peterson field guides|national audubon|plume|princeton science library|virago|wordsworth classics|world's classics|perennial fiction|cassell|hqn|hyperion)\b|\bp\.s\.(?=\s|$)/i

const PLAIN_FORMAT = /^(paperback|hardcover|case laminate hardcover with jacket|\d{4}-\d{2}-\d{2})$/i

const SERIES_WORD = /\b(series|trilogy|saga|chronicles|cycle|sequence|quartet|mysteries|mystery|adventures?)\b/i

// "Jackson Brodie, 1", "Magic Tree House, No. 3", "The Bad Guys #8", "Book 5", "20".
function splitNumber(text) {
  const match = text.match(/^(.*?)[,\s]*(?:\b(?:book|bk\.?|vol\.?|volume|no\.?|number|part)\s*#?|#\s*|[,\s]\s*)(\d{1,3})$/i)
  if (match) return { name: match[1].trim(), number: match[2] }
  if (/^\d{1,3}$/.test(text)) return { name: '', number: text }
  return { name: text, number: '' }
}

const plain = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// What one piece of added text is. `knownSeries` holds LibraryThing's series
// names for this book, which confirm a guess but are too messy to rely on alone.
function classify(text, knownSeries) {
  const ruling = PHRASE_RULINGS[text.toLowerCase()]
  if (ruling) return ruling
  if (PROMO.test(text)) return { kind: 'promo' }
  if (FORM_LABEL.test(text)) return { kind: 'label' }
  const { name, number } = splitNumber(text)
  // Before edition notes, so "Penguin Classics Deluxe Edition" counts as a line.
  if (PUBLISHER_SERIES.test(name)) return { kind: 'publisher series', name, number }
  if (EDITION_NOTE.test(text)) return { kind: 'edition' }
  if (MAYBE_KEEP.test(text)) return { kind: 'keep?', check: true }
  if (knownSeries.some((s) => plain(s) === plain(name))) return { kind: 'series', name, number }
  if (number && name) return { kind: 'series', name, number }
  if (number) return { kind: 'series', name: '', number, check: true }
  if (SERIES_WORD.test(name)) return { kind: 'series', name, number }
  return { kind: 'unknown', name, check: true }
}

const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,;:])/g, '$1').replace(/[\s,;:–—-]+$/, '').trim()

export function cleanTitle(title, knownSeries = []) {
  const result = { title: title.trim(), series: [], number: '', publisherSeries: [], editionNotes: [], removed: [], checks: [] }

  function addSeries(name) {
    const standard = SERIES_NAMES[name.toLowerCase()] ?? name
    if (!result.series.includes(standard)) result.series.push(standard)
  }

  function record(text, piece) {
    if (piece.kind === 'series' || piece.kind === 'publisher series') {
      if (piece.kind === 'publisher series') result.publisherSeries.push([piece.name, piece.number].filter(Boolean).join(' '))
      else {
        if (piece.name) addSeries(piece.name)
        // A "0" is a bookseller's blank, not a place in a series.
        if (piece.number !== '0') result.number ||= piece.number
      }
    }
    // Plain format words and dates are already covered by other fields.
    if (piece.kind === 'edition' && !PLAIN_FORMAT.test(text)) result.editionNotes.push(text)
    result.removed.push({ text, kind: piece.kind })
    if (piece.check && piece.kind !== 'series') result.checks.push(`"${text}": what is this?`)
  }

  // Text in parentheses or brackets, anywhere in the title. Left in the title
  // for now if it's unknown or might be worth keeping.
  let clean = title.replace(/\s*(?:\(([^()]*)\)|\[([^[\]]*)\])/g, (whole, a, b, offset, all) => {
    // Attached to a word, as in "(Dis)ability", the brackets are part of the title.
    const before = whole.startsWith('(') || whole.startsWith('[') ? all[offset - 1] : ''
    if (/\p{L}/u.test(all[offset + whole.length] ?? '') || /\p{L}/u.test(before ?? '')) return whole
    const text = (a ?? b).trim()
    const piece = classify(text, knownSeries)
    if (piece.kind === 'unknown' || piece.kind === 'keep?') {
      result.removed.push({ text, kind: piece.kind, kept: true })
      result.checks.push(`"${text}": ${piece.kind === 'keep?' ? 'keep in the title?' : 'what is this?'}`)
      return whole
    }
    record(text, piece)
    return ''
  })
  clean = tidy(clean)

  // Whatever follows the last colon, repeatedly, while it's clearly not a subtitle.
  for (;;) {
    const colon = clean.lastIndexOf(':')
    if (colon === -1) break
    const tail = clean.slice(colon + 1).trim()
    if (FORM_LABEL.test(tail)) record(tail, { kind: 'label' })
    else if (/^\d{1,3}$/.test(tail)) record(tail, { kind: 'series', name: '', number: tail, check: true })
    else if (EDITION_NOTE.test(tail) && tail.split(' ').length <= 5) record(tail, { kind: 'edition' })
    else if (PROMO.test(tail)) {
      // A real subtitle can carry promotional words, so only a short one goes unchecked.
      if (/^a must[- ]read\b/i.test(tail) || tail.split(' ').length > 8) {
        result.checks.push(`"${tail}": promotional words in what may be a real subtitle`)
        break
      }
      record(tail, { kind: 'promo' })
    } else break
    clean = tidy(clean.slice(0, colon))
  }

  // Edition notes after a dash or comma: "... - First Edition", "..., Book Club Edition".
  clean = tidy(clean.replace(/(?:\s[-–—]\s|,\s)([^,:–—]*)$/, (whole, tail) => {
    if (!EDITION_NOTE.test(tail)) return whole
    record(tail.trim(), { kind: 'edition' })
    return ''
  }))

  for (const { pattern, name } of TITLE_SERIES) {
    const match = clean.match(pattern)
    if (!match) continue
    addSeries(name)
    result.number ||= match[1] ?? ''
  }

  // A number found alone belongs to the series named elsewhere on the book.
  if (result.number && !result.series.length) {
    const named = knownSeries.find((s) => plain(s) && ` ${plain(clean)} `.includes(` ${plain(s)} `))
    if (named) addSeries(named)
    else if (result.publisherSeries.length === 1) {
      result.publisherSeries[0] += ` ${result.number}`
      result.number = ''
    } else result.checks.push(`"${result.number}": a number with no series name`)
  }

  // Things a rule shouldn't guess at.
  if (/\s[-–—]\s/.test(clean)) result.checks.push('has a dash: real subtitle, or added text?')
  if (/^by\s/i.test(clean)) result.checks.push('starts with the author')
  if (!(result.series.length && result.number) && /(\bvol\.?|\bvolume|\bpart|\bbook|#)\s*#?\d/i.test(clean)) result.checks.push('series or volume number inside the title')
  if (/:\s*an? [^:]*\bnovel$/i.test(clean)) result.checks.push('"... Novel" subtitle: a label, or a series?')
  if (/:\s*['‘“"]/.test(clean)) result.checks.push('subtitle looks like a quoted review')
  if (clean.length > 90) result.checks.push('still very long')
  if (clean === clean.toUpperCase() && /\p{L}{4}/u.test(clean)) result.checks.push('all capitals')

  result.title = clean || title.trim()
  result.changed = result.title !== title.trim()
  return result
}
