// Works out what the title cleanup would change, from the library's rows as they
// are now. Changes nothing itself. Fills blanks only: anything entered by hand
// stays, so running the plan again after applying it finds nothing to do.

import { cleanTitle } from '../../src/titles/cleanTitle.js'
import { PUBLISHER_SERIES_NAMES, SERIES_NAMES } from '../../src/titles/phrase-rulings.js'

const same = (a, b) => a.toLowerCase() === b.toLowerCase()

// "Penguin Epics 17" → name and number, as cleanTitle keeps them together.
function splitPublisherSeries(text) {
  const match = text.match(/^(.*\S)\s+(\d{1,3})$/)
  const [name, number] = match ? [match[1], match[2]] : [text, '']
  return { name: PUBLISHER_SERIES_NAMES[name.toLowerCase()] ?? name, number }
}

// One shared list (series or publisher's series): finds entries by name or alias,
// and collects the entries the plan needs to add.
function listKeeper(rows, aliasMap) {
  const entries = rows.map((row) => ({ ...row }))
  const added = []
  const aliasesFor = (name) => Object.keys(aliasMap).filter((alias) => same(aliasMap[alias], name))
  const find = (name) => {
    let entry = entries.find((e) => same(e.name, name) || e.aliases.some((a) => same(a, name)))
    if (!entry) {
      entry = { id: `new:${name}`, name, aliases: aliasesFor(name) }
      entries.push(entry)
      added.push(entry)
    }
    return entry
  }
  // Aliases this list's existing entries are missing.
  const aliasUpdates = () =>
    entries.flatMap((e) => {
      if (added.includes(e)) return []
      const missing = aliasesFor(e.name).filter((alias) => !e.aliases.some((a) => same(a, alias)))
      return missing.length ? [{ id: e.id, aliases: [...e.aliases, ...missing] }] : []
    })
  return { find, added, aliasUpdates }
}

// New links for one copy: a label it already has only gains a number if blank.
function labelChanges(copyId, wanted, links, idColumn, list) {
  const mine = links.filter((l) => l.copy_id === copyId)
  let position = mine.reduce((most, l) => Math.max(most, l.position + 1), 0)
  const put = []
  for (const { name, number } of wanted) {
    const entry = list.find(name)
    const link = mine.find((l) => l[idColumn] === entry.id)
    if (!link) put.push({ copy_id: copyId, [idColumn]: entry.id, name: entry.name, number: number || null, position: position++ })
    else if (number && !link.number) put.push({ ...link, name: entry.name, number })
  }
  return put
}

// `library` holds the rows of copies, series, publisher_series, copy_series, and
// copy_publisher_series. New list entries have ids starting "new:" until saved.
export function planTitleCleanup(library) {
  const seriesList = listKeeper(library.series, SERIES_NAMES)
  const publisherList = listKeeper(library.publisher_series, PUBLISHER_SERIES_NAMES)
  const books = []

  for (const copy of library.copies) {
    const original = copy.original_title ?? copy.title
    const clean = cleanTitle(original, copy.lt_record?.series ?? [])

    const changes = {}
    // A title that already has its original saved has been through the cleanup,
    // and may have been edited by hand since.
    if (!copy.original_title && clean.title !== copy.title) {
      changes.title = clean.title
      changes.original_title = copy.title
    }
    const editionNote = clean.editionNotes.join('; ')
    if (editionNote && !copy.edition_note) changes.edition_note = editionNote
    if (clean.notes && !copy.notes) changes.notes = clean.notes

    // With two labels, the number belongs to the second, which names the set:
    // Lumberjanes, then Lumberjanes Comics 8.
    const series = clean.series.map((name, i) => ({ name, number: i === clean.series.length - 1 ? clean.number : '' }))
    const seriesLinks = labelChanges(copy.id, series, library.copy_series, 'series_id', seriesList)
    const publisherLinks = labelChanges(
      copy.id,
      clean.publisherSeries.map(splitPublisherSeries),
      library.copy_publisher_series,
      'publisher_series_id',
      publisherList,
    )

    if (Object.keys(changes).length || seriesLinks.length || publisherLinks.length || clean.checks.length) {
      books.push({ copy, changes, seriesLinks, publisherLinks, checks: clean.checks })
    }
  }

  return {
    books,
    newSeries: seriesList.added,
    newPublisherSeries: publisherList.added,
    seriesAliases: seriesList.aliasUpdates(),
    publisherAliases: publisherList.aliasUpdates(),
  }
}

export const planIsEmpty = (plan) =>
  !plan.books.some((b) => Object.keys(b.changes).length || b.seriesLinks.length || b.publisherLinks.length) &&
  !plan.newSeries.length &&
  !plan.newPublisherSeries.length &&
  !plan.seriesAliases.length &&
  !plan.publisherAliases.length
