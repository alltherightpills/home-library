// Dates as the app stores and shows them. No database here, so tests can use it.

// Today by the phone's own clock, as stored: "2026-11-08".
export const today = () => new Date().toLocaleDateString('en-CA')

// "Nov 2, 2026" from a stored "2026-11-02".
export const dateText = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
