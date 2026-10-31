// The owner's rulings on phrases found in titles. These win over the rules in
// cleanTitle.js. Phrases are matched without regard to capitals.

const series = (name, number = '') => ({ kind: 'series', name, number })
const publisherSeries = (name, number = '') => ({ kind: 'publisher series', name, number })
const editionNote = { kind: 'edition' }
const deleted = { kind: 'deleted' }

export const PHRASE_RULINGS = {
  'griffin and sabine': series('Griffin and Sabine'),
  pokémon: series('Pokémon'),
  'great ideas': series('Penguin Great Ideas'),
  'penguin great ideas': series('Penguin Great Ideas'),
  'great loves': series('Penguin Great Loves'),
  'penguin great loves': series('Penguin Great Loves'),
  'girls survive': series('Girls Survive'),
  'the library of esoterica': series('The Library of Esoterica'),
  'time quintet': series('Time Quintet'),
  'marvin redpost 8, paper': series('Marvin Redpost', '8'),
  'star wars episode i': series('Star Wars Episode I'),
  neapolitan: series('Neapolitan'),
  'alec flint, super sleuth': series('Alec Flint, Super Sleuth'),
  'calligraphy basics': series('Calligraphy Basics'),
  hyperion: series('Hyperion'),
  'the complete greek tragedies': series('The Complete Greek Tragedies'),

  'emergent strategy, 1': publisherSeries('Emergent Strategy', '1'),
  "heroes of the women's suffrage movement": publisherSeries("Heroes of the Women's Suffrage Movement"),
  'mysteries, magic and myth': publisherSeries('Mysteries, Magic and Myth'),
  'national park mystery series': publisherSeries('National Park Mystery Series'),

  'english and german edition': editionNote,
  'greek edition': editionNote,
  '2 books in 1': editionNote,

  ...Object.fromEntries(
    [
      'ancient myths', 'corporealities: discourses of disability', 'dungeons & dragons', 'travel guide',
      'a baking book', 'a studio book', 'almost everything', 'american land & life', "classic children's books",
      "dk bibles and bible guides", "dk children's year by year", 'dungeons & dragons core rulebook', 'eminent lives',
      'game of thrones', 'harpersanfrancisco, 2002', 'hauntings, horrors & scary ghost stories', 'hc',
      'literary disability studies', 'los versos del capitan', 'masterpiece library edition', 'messages from the dead',
      'minecraft', 'modern plays', 'myths, gods & immortals', 'o & h study guides',
      'official guides to the appalachian trail', 'palgrave shakespeare studies', 'part two of two', 'pb', 'read red',
      'reading rainbow book', 'red classics', 'redemption edition', "seth's christmas ghost stories",
      'signature editions', 'syrian fiction', 'the ^aoxford shakespeare',
      'the archive for research in archetypal symbolism', 'the gray-eyed goddess; return to ithaca, the final battle',
      'the hunchback of notre dame', 'the nutshell library', 'the virginia woolf library',
      'a wild true crime adventure', 'american experience in archaeological pespective', 'american lives',
      'art and ideas', 'cambridge companions to literature', "dk children's anthologies", 'dk pockets', 'dk the met',
      'engaging culture', 'firefly pocket series', "gregg press children's literature series", 'hogarth shakespeare',
      'iowa whitman series', 'lonely planet phrasebooks', 'pitt poetry series', 'pocket essential series',
      'tudor and stuart texts, volume 4',
    ].map((phrase) => [phrase, deleted]),
  ),
}

// Different spellings of one series. Each book keeps the number printed on it:
// the two Narnia sets number the same books differently.
export const SERIES_NAMES = {
  'a narwhal and jelly': 'Narwhal and Jelly',
  'an alec flint mystery': 'Alec Flint, Super Sleuth',
  'chronicles of narnia': 'The Chronicles of Narnia',
  'the three-body problem series': 'The Three-Body Problem',
}

// Series named in the title itself, with no brackets. A match's first group is the number.
export const TITLE_SERIES = [
  { pattern: /^McSweeney['’]s Issue (\d+)/i, name: "McSweeney's Quarterly Concern" },
  { pattern: /^Lumberjanes\b(?:.*?\bVol\.?\s*(\d+))?/i, name: 'Lumberjanes' },
]
