// Edit a Book's people: the roles to choose from, and what saving the form
// changes. No database here (bookEdits.js does the saving), so it can be tested.

// The roles offered, most used first (from the catalog's credits, 2026-11-20).
// A book's own rarer role (Primary Contributor, say) is offered too.
export const ROLES = [
  'Author',
  'Editor',
  'Contributor',
  'Translator',
  'Illustrator',
  'Introduction',
  'Foreword',
  'Afterword',
  'Compiler',
  'Creator',
  'Adapter',
  'Artist',
  'Photographer',
  'Colorist',
  'Narrator',
]

export const rolesFor = (role) => (ROLES.includes(role) ? ROLES : [...ROLES, role])

// The form's rows: { last, first, role, saved }, where `saved` is the credit
// the row started as ({ authorId, role, position }), or null for a new row.
export const formPeople = (people) =>
  people.map((p) => {
    const name = splitName(p.author)
    return { ...name, role: p.role, saved: { authorId: p.author.id, role: p.role, position: p.position, ...name } }
  })

// A new row, or a saved one whose name was changed: worth checking against the
// library's people (Edit a Book's "Already in your library" note).
export const nameChanged = (row) => !row.saved || row.saved.last !== row.last.trim() || row.saved.first !== row.first.trim()

function splitName(author) {
  const comma = author.sort_name.indexOf(',')
  if (comma === -1) return { last: author.sort_name, first: '' }
  return { last: author.sort_name.slice(0, comma).trim(), first: author.sort_name.slice(comma + 1).trim() }
}

// What saving changes, against the credits as stored (`people`):
//   remove: credits whose row was removed;
//   change: rows whose name or role changed ({ saved, last, first, role, renamed });
//   add:    new rows with a last name ({ last, first, role, position }).
// A new row left blank is ignored.
export function planPeople(people, rows) {
  const kept = new Set(rows.filter((r) => r.saved).map((r) => key(r.saved)))
  const remove = people.filter((p) => !kept.has(key({ authorId: p.author.id, role: p.role }))).map((p) => ({ authorId: p.author.id, role: p.role }))
  const change = []
  const add = []
  let position = Math.max(-1, ...people.map((p) => p.position ?? 0))
  for (const row of rows) {
    const last = row.last.trim()
    const first = row.first.trim()
    if (row.saved) {
      const was = splitName(people.find((p) => p.author.id === row.saved.authorId && p.role === row.saved.role).author)
      const renamed = was.last !== last || was.first !== first
      if (renamed || row.role !== row.saved.role) change.push({ saved: row.saved, last, first, role: row.role, renamed })
    } else if (last) {
      add.push({ last, first, role: row.role, position: ++position })
    }
  }
  return { remove, change, add }
}

const key = ({ authorId, role }) => `${authorId}|${role}`

// The same person twice in the same role can't be saved (the database refuses it).
export function duplicatePerson(rows) {
  const seen = new Set()
  for (const row of rows) {
    if (!row.last.trim()) continue
    const id = `${row.last.trim().toLowerCase()}|${row.first.trim().toLowerCase()}|${row.role}`
    if (seen.has(id)) return `${[row.first.trim(), row.last.trim()].filter(Boolean).join(' ')} is listed twice as ${row.role}.`
    seen.add(id)
  }
  return ''
}
