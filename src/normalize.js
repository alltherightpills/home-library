// Text compared the way search and the A–Z strip compare it. Kept apart from
// useCatalog.js (which connects to the database) so tests can use it.

// Letters that aren't an accent on a plain letter, so removing accents misses them.
const SPECIAL_LETTERS = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', æ: 'ae', œ: 'oe', ß: 'ss', ı: 'i' }

// Lowercase and strip accents, so "pokemon" matches "Pokémon" and "soren" matches "Søren".
export function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[øłđðþæœßı]/g, (letter) => SPECIAL_LETTERS[letter])
}
