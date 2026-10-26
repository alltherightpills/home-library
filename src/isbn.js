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
