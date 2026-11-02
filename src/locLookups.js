// Asking the Library of Congress catalog about a book, and reading its MARC
// records. Shared by the app (Scan to add, through the relay in
// supabase/functions/loc) and the scripts (`npm run enrich`, straight to LC).
// Each caller passes its own way of asking:
//
//   askLoc(query, max) -> LC's MARCXML answer as text, for a search such as
//   'bath.isbn=0375705392' and at most `max` records (1–10)

import { plain, shortTitle } from './bookLookups.js'

// LC's SRU server. The scripts ask it directly; the relay builds the same address.
export const locUrl = (query, max) =>
  'http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve' +
  `&query=${encodeURIComponent(query)}&maximumRecords=${max}&recordSchema=marcxml`

function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// -> [{ leader, control: { '008': '...' }, fields: [{ tag, ind1, ind2, sub: [['a', '...'], ...] }] }]
export function parseMarcRecords(xml) {
  const records = []
  for (const [rec] of xml.matchAll(/<(?:\w+:)?record[\s>][\s\S]*?<\/(?:\w+:)?record>/g)) {
    if (!/<(?:\w+:)?leader>/.test(rec)) continue
    const control = {}
    for (const [, tag, value] of rec.matchAll(/<(?:\w+:)?controlfield tag="(\w+)">([\s\S]*?)<\/(?:\w+:)?controlfield>/g)) {
      control[tag] = decodeXml(value)
    }
    const fields = []
    for (const [, tag, ind1, ind2, body] of rec.matchAll(
      /<(?:\w+:)?datafield tag="(\w+)" ind1="(.)" ind2="(.)">([\s\S]*?)<\/(?:\w+:)?datafield>/g,
    )) {
      const sub = [...body.matchAll(/<(?:\w+:)?subfield code="(.)">([\s\S]*?)<\/(?:\w+:)?subfield>/g)].map(
        ([, code, value]) => [code, decodeXml(value).trim()],
      )
      fields.push({ tag, ind1, ind2, sub })
    }
    records.push({ leader: rec.match(/<(?:\w+:)?leader>([\s\S]*?)<\//)?.[1] ?? '', control, fields })
  }
  return records
}

export const parseMarcXml = (xml) => parseMarcRecords(xml)[0] ?? null

// ---------------------------------------------------------------------------
// The two searches
// ---------------------------------------------------------------------------

// This edition's own record, or null. LC's catalog often indexes only the
// ISBN-10, so try that first, then the ISBN-13.
export async function lookUpLocByIsbn(isbn10, isbn13, askLoc) {
  for (const isbn of [isbn10, isbn13].filter(Boolean)) {
    const record = parseMarcXml(await askLoc(`bath.isbn=${isbn}`, 1))
    if (record) return record
  }
  return null
}

// Records of any edition whose title starts with the book's title and that
// name the author: { query, records }, or null. LC sends at most 10, newest
// editions first, so `year` (the year printed in a copy) narrows it to that year's.
// LC's search finds nothing for accented letters ("García Márquez": 0 records;
// "Garcia Marquez": 7), so they're asked without accents.
const unaccented = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/"/g, '')

export async function lookUpLocByTitle(title, surname, askLoc, { year } = {}) {
  const short = unaccented(shortTitle(title))
  if (!short) return null
  const query = `dc.title="${short}"` + (surname ? ` and bath.author="${unaccented(surname)}"` : '') +
    (year ? ` and dc.date=${year}` : '')
  const records = parseMarcRecords(await askLoc(query, 10)).filter((r) => {
    const f245 = r.fields.find((f) => f.tag === '245')
    const heading = f245?.sub.filter(([c]) => c === 'a' || c === 'b').map(([, v]) => v).join(' ') ?? ''
    return plain(heading).startsWith(plain(short))
  })
  return records.length ? { query, records } : null
}

// ---------------------------------------------------------------------------
// Reading one record
// ---------------------------------------------------------------------------

const SUBJECT_TAGS = ['600', '610', '611', '630', '650', '651', '655']

const subfields = (lc, tag, codes) =>
  lc?.fields.find((f) => f.tag === tag)?.sub.filter(([c]) => codes.includes(c)).map(([, v]) => v).join(' ') || null

// The subject and genre/form fields, as copies.lc_subjects stores them.
export const locSubjects = (lc) =>
  (lc?.fields ?? []).filter((f) => SUBJECT_TAGS.includes(f.tag)).map(({ tag, ind1, ind2, sub }) => ({ tag, ind1, ind2, sub }))

// "PS3563.O8749 B4 1987"
export const locCallNumber = (lc) => subfields(lc, '050', 'ab')

// "813/.54"; the first number when there are several.
export const locDewey = (lc) => lc?.fields.find((f) => f.tag === '082')?.sub.find(([c]) => c === 'a')?.[1] ?? null

// The original publication year LC records in 008 for reprints ("r19991985").
export function locOriginalYear(lc) {
  const f008 = lc?.control['008'] ?? ''
  if (f008[6] !== 'r') return null
  const year = f008.slice(11, 15)
  return /^\d{4}$/.test(year) ? Number(year) : null
}

// "xxii, 327 p. : ill. ; 24 cm." -> 327
export function locPages(lc) {
  const extent = lc?.fields.find((f) => f.tag === '300')?.sub.find(([c]) => c === 'a')?.[1] ?? ''
  const nums = [...extent.matchAll(/(\d+)\s*(?:p\b|pages)/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : null
}

// ---------------------------------------------------------------------------
// One record as a book's details, for Add by hand
// ---------------------------------------------------------------------------

// Drops the punctuation LC puts between parts: "The wind in the willows /" -> "The wind in the willows".
const tidyPart = (text) => (text ?? '').replace(/\s*[/:;,=]\s*$/, '').replace(/(?<!\b\p{Lu})\.$/u, '').trim()

// The people credited as authors: the main entry (100) and added names (700)
// with no role or the role "author", leaving out illustrators, editors and the like.
function locAuthors(lc) {
  return lc.fields
    .filter((f) => f.tag === '100' || f.tag === '700')
    .filter((f) => !f.sub.some(([c]) => c === 't'))
    .filter((f) => f.tag === '100' || !f.sub.some(([c, v]) => c === 'e' && !/author/i.test(v)))
    .map((f) => tidyPart(f.sub.find(([c]) => c === 'a')?.[1]))
    .filter(Boolean)
}

// "Grahame, Kenneth" -> "Kenneth Grahame"
const displayName = (sortName) => {
  const [last, first] = sortName.split(/,\s*/, 2)
  return first ? `${first} ${last}` : last
}

// What an LC record says about its edition. Authors come both as LC files them
// ("García Márquez, Gabriel", which splits cleanly) and as they're shown.
export function locEdition(lc) {
  const f245 = lc.fields.find((f) => f.tag === '245')
  const part = (code) => tidyPart(f245?.sub.find(([c]) => c === code)?.[1])
  const imprint = lc.fields.find((f) => f.tag === '264' && f.ind2 === '1') ?? lc.fields.find((f) => f.tag === '260')
  const f008 = lc.control['008'] ?? ''
  const year = /^\d{4}$/.test(f008.slice(7, 11)) ? Number(f008.slice(7, 11))
    : Number(imprint?.sub.find(([c]) => c === 'c')?.[1].match(/\d{4}/)?.[0]) || null
  const sortNames = locAuthors(lc)
  return {
    title: part('a'),
    subtitle: part('b') || null,
    authorSortNames: sortNames,
    authors: sortNames.map(displayName),
    publisher: tidyPart(imprint?.sub.find(([c]) => c === 'b')?.[1]) || null,
    year,
    pages: locPages(lc),
    firstPublished: locOriginalYear(lc),
    // "7. ed." keeps its periods; only the joining punctuation goes.
    edition: lc.fields.find((f) => f.tag === '250')?.sub.find(([c]) => c === 'a')?.[1].replace(/\s*[/:;,=]\s*$/, '').trim() || null,
    languageCode: f008.slice(35, 38).trim() || null,
  }
}
