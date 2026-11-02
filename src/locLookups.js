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
// name the author: { query, records }, or null.
export async function lookUpLocByTitle(title, surname, askLoc) {
  const short = shortTitle(title).replace(/"/g, '')
  if (!short) return null
  const query = `dc.title="${short}"` + (surname ? ` and bath.author="${surname.replace(/"/g, '')}"` : '')
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
