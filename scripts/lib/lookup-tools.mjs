// Shared by the lookup scripts: polite fetching and reading LC's MARCXML.

export const USER_AGENT = 'HomeLibrary/0.1 (personal catalog; github.com/alltherightpills/home-library)'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function pacer(minGapMs) {
  let next = 0
  return async function fetchPolitely(url) {
    for (let attempt = 1; ; attempt++) {
      const wait = next - Date.now()
      if (wait > 0) await sleep(wait)
      next = Date.now() + minGapMs
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        })
        if (res.ok) return await res.text()
        // Too many requests or a server hiccup: back off and try again.
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          next = Date.now() + minGapMs * 10 * attempt
          continue
        }
        throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        if (attempt >= 4) throw err
        next = Date.now() + minGapMs * 10 * attempt
      }
    }
  }
}

// One LC server, one pace, whichever kind of search is asking.
export const fetchLoc = pacer(2000)

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
