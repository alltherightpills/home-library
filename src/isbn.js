// Returns the ISBN-13 if `code` is a valid book barcode, otherwise null.
// Book barcodes are EAN-13 numbers starting with 978 or 979; the last digit
// is a check digit computed from the first twelve, which catches misreads.
export function toIsbn(code) {
  if (!/^97[89]\d{10}$/.test(code)) return null

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return check === Number(code[12]) ? code : null
}

// Returns the ISBN-10 if `code` is valid, otherwise null. Its last character
// is a check digit too, which can be X (meaning 10).
export function toIsbn10(code) {
  if (!/^\d{9}[\dX]$/.test(code)) return null

  let sum = 0
  for (let i = 0; i < 10; i++) {
    sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i)
  }
  return sum % 11 === 0 ? code : null
}

// "0375705392" → "9780375705392": an ISBN-10 is the same number with 978 in
// front and a new check digit.
export function isbn10To13(isbn10) {
  const first12 = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return first12 + ((10 - (sum % 10)) % 10)
}

// The other way. Only 978 ISBNs have an ISBN-10; 979 ones never did.
export function isbn13To10(isbn13) {
  if (!isbn13.startsWith('978')) return null
  const first9 = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return first9 + (check === 10 ? 'X' : check)
}

// Reads a typed or pasted ISBN of either length, ignoring hyphens, spaces, and
// hidden characters. Returns { isbn } as an ISBN-13, or { problem } in words.
export function readTypedIsbn(text) {
  const code = text.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase()
  if (code.length === 13) {
    return toIsbn(code) ? { isbn: code } : { problem: "That ISBN-13 isn't valid. Check for a mistyped digit." }
  }
  if (code.length === 10) {
    return toIsbn10(code)
      ? { isbn: isbn10To13(code) }
      : { problem: "That ISBN-10 isn't valid. Check for a mistyped digit." }
  }
  if (code.length === 12 && /^\d+$/.test(code)) return { problem: UPC_HINT }
  return { problem: 'An ISBN has 10 or 13 characters.' }
}

// Shown when a store barcode is scanned or typed instead of the ISBN.
export const UPC_HINT =
  "That's a store (UPC) barcode, not the ISBN. Older paperbacks often have the ISBN barcode inside the front cover, or the ISBN printed on the copyright page."

// The copies with this ISBN-13, matching either stored ISBN.
export function copiesWithIsbn(copies, isbn13) {
  const isbn10 = isbn13To10(isbn13)
  return copies.filter((c) => c.isbn13 === isbn13 || (isbn10 && c.isbn10 === isbn10))
}
