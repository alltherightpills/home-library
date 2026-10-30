// The category rules: which clues put a book in which category. Edit freely;
// run "npm run categories:report" afterwards to see what changed.
//
// Each rule's `when` lists clues; a book matches if it has ANY of them:
//   dewey:   Dewey numbers, matched from the start. 'x' stands for any digit, so
//            '8x1' matches 811 and 821.3; a range like '910-919' covers whole numbers;
//            '*092' means 092 appears anywhere after the first three digits.
//   lc:      LC classes. 'PZ' is that class exactly; 'H*' is every class starting with H
//            (H, HQ, HV ...); 'PN6700-6790' is a number range within one class.
//   heading: words found anywhere in a subject heading or genre/form term (LC's
//            and LibraryThing's), ignoring capitals. Start with '-- ' to match only
//            a subdivision: '-- poetry' matches "Love -- Poetry" but not "English poetry".
//   genre:   LibraryThing genres, exactly as LibraryThing spells them.
//   title:   words in the title, ignoring capitals (a last resort).
// `unless` (optional) takes the same kinds of clues and cancels the rule.

// Main categories, in the order shown in the app.
export const MAIN_CATEGORIES = [
  'Fiction',
  'Nonfiction',
  'Poetry',
  'Drama',
  'Comics & Graphic Novels',
  'Biography & Memoir',
  'Myth, Folklore & Fairy Tales',
  'Essays, Letters & Criticism',
]

// The main category: rules are tried top to bottom and the FIRST match decides.
// So the order is the priority: Dewey (a cataloger's call for this edition)
// comes before subject headings, and LibraryThing genres come last.
export const MAIN_RULES = [
  // McSweeney's is a fiction anthology in every issue, whatever its Dewey or format.
  { main: 'Fiction', when: { title: ["mcsweeney's"] } },

  // Format first: a graphic memoir or graphic novel goes here, whatever its subject.
  { main: 'Comics & Graphic Novels', when: { dewey: ['741.5'], lc: ['PN6700-6790'], genre: ['Comics'],
    heading: ['graphic novels', 'comic books, strips', 'comics (graphic works)'] } },

  // Travel writing is Nonfiction > Travel, even when told as a memoir.
  { main: 'Nonfiction', when: { dewey: ['910-919'], heading: ['-- description and travel', 'voyages and travels'] } },

  // Lives. Dewey files most biographies with their subject and marks them with
  // 092 (641.5092 is a chef's life), so these come before the subject rules.
  // But 08 then 092 means a collection by a group of people (823.0108092), not a life,
  // and 8x0.8 is a collection of one literature (820.809287 is writing by women).
  { main: 'Biography & Memoir', when: { dewey: ['920-929', '*092'], lc: ['CT'],
    heading: ['-- biography', 'autobiographies', 'biographies', '-- diaries'] },
    unless: { dewey: ['*08092', '8x0.8'], heading: ['-- fiction', 'juvenile fiction'] } },

  // Literature. Collections of several literatures: 808.81 poetry, 808.82 drama, 808.83 fiction.
  { main: 'Poetry', when: { dewey: ['808.81'] } },
  { main: 'Drama', when: { dewey: ['808.82'] } },
  { main: 'Fiction', when: { dewey: ['808.83'] } },
  // Classical Greek and Latin: lyric (884, 874) and epic (883, 873) poetry.
  { main: 'Poetry', when: { dewey: ['884', '874', '883', '873'] } },
  // Literatures in 890-899: the form digit follows the language's (895.6 Japanese, so 895.63 is Japanese fiction).
  { main: 'Drama', when: { dewey: ['89x.x2'] } },
  { main: 'Poetry', when: { dewey: ['89x.x1'] } },
  { main: 'Fiction', when: { dewey: ['89x.x3'] } },
  // All other literatures: the third digit is the form (8x1 poetry, 8x2 drama, 8x3 fiction ...).
  { main: 'Drama', when: { dewey: ['8x2'] }, unless: { dewey: ['89'] } },
  { main: 'Poetry', when: { dewey: ['8x1'] }, unless: { dewey: ['89'] } },
  { main: 'Fiction', when: { dewey: ['8x3'] }, unless: { dewey: ['89'] } },
  { main: 'Essays, Letters & Criticism', when: { dewey: ['800-809', '8x0', '8x4', '8x5', '8x6', '8x7', '8x8'] },
    unless: { dewey: ['89'] } },

  // Folklore and mythology (Dewey 398 and 290s mythology, LC GR and BL300-325).
  { main: 'Myth, Folklore & Fairy Tales', when: { dewey: ['398', '201.3', '292', '293', '299'], lc: ['GR', 'BL300-325'] } },

  // Every other Dewey number is nonfiction.
  { main: 'Nonfiction', when: { dewey: ['0', '1', '2', '3', '4', '5', '6', '7', '9'] } },

  // No usable Dewey: fall back to LC class, then headings, then LibraryThing.
  { main: 'Fiction', when: { lc: ['PZ'] } },
  { main: 'Myth, Folklore & Fairy Tales', when: { heading: ['fairy tales', 'folklore', 'legends', 'mythology'] },
    unless: { heading: ['-- fiction', 'juvenile fiction'] } },
  { main: 'Poetry', when: { heading: ['-- poetry', 'poems'], genre: ['Poetry'] } },
  { main: 'Drama', when: { heading: ['-- drama', 'plays'] } },
  { main: 'Biography & Memoir', when: { heading: ['-- biography', 'autobiographies', 'biographies'], genre: ['Biography & Memoir'] } },
  { main: 'Fiction', when: { heading: ['fiction', 'novels', 'short stories'],
    genre: ['Fiction', 'General Fiction', 'Fantasy', 'Science Fiction', 'Historical Fiction', 'Romance', 'Horror', 'Mystery', 'Suspense & Thriller', 'Christian Fiction'] } },
  { main: 'Nonfiction', when: { lc: ['A*', 'B*', 'C*', 'D*', 'E', 'F', 'G*', 'H*', 'J*', 'K*', 'L*', 'M*', 'N*', 'Q*', 'R*', 'S*', 'T*', 'U*', 'V*', 'Z*'],
    genre: ['Nonfiction', 'General Nonfiction'] } },

  // Nothing else to go on.
  { main: 'Poetry', when: { heading: ['poetry'], title: ['poems', 'poetry'] } },
  { main: 'Myth, Folklore & Fairy Tales', when: { title: ['myths', 'legends', 'tales of', 'tales from', 'fairy tales'] } },
  { main: 'Fiction', when: { title: ['stories', 'a novel'] } },
]

// Subcategories: a book gets EVERY one that matches within its main category.
export const SUBCATEGORY_RULES = {
  'Fiction': [
    { sub: 'Fantasy', when: { dewey: ['8x3.08766'], genre: ['Fantasy'], heading: ['fantasy', 'magic', 'time travel', 'monsters', 'dragons', 'wizards', 'witches'] } },
    { sub: 'Historical Fiction', when: { dewey: ['8x3.081'], genre: ['Historical Fiction'], heading: ['historical fiction'] } },
    { sub: 'Mystery & Suspense', when: { dewey: ['8x3.0872'], genre: ['Mystery', 'Suspense & Thriller'], heading: ['detective and mystery', 'mystery', 'suspense', 'thrillers'] } },
    { sub: 'Romance', when: { dewey: ['8x3.085'], genre: ['Romance'], heading: ['love stories', 'romance fiction', 'romances'] } },
    { sub: 'Science Fiction', when: { dewey: ['8x3.08762'], genre: ['Science Fiction'], heading: ['science fiction'] } },
    { sub: 'Horror', when: { dewey: ['8x3.0873'], genre: ['Horror'], heading: ['horror', 'ghost stories', 'gothic fiction', 'supernatural'], title: ['ghost stor', 'weird'] } },
    // Story collections often have no heading but say so in the title ("Tenth of December: Stories").
    // Fiction anthologies go here too: in fiction they are nearly always story collections.
    { sub: 'Short Stories & Anthologies', when: { dewey: ['808.83', '*0108', '8x3.x08'], heading: ['short stories', 'anthologies', 'anthology'],
      title: [' stories', 'tales of', 'and other tales', 'anthology', "mcsweeney's"] } },
    { sub: 'Literary Fiction', when: { heading: ['fiction / literary', 'literary fiction'] } },
    { sub: 'Family & Relationships', when: { heading: ['psychological fiction', 'domestic fiction', 'married women', 'family life',
      'parent and adult child', 'fathers and daughters', 'mothers and daughters', 'man-woman relationships'] } },
    { sub: 'Coming of Age', when: { heading: ['bildungsrom', 'coming of age', 'autobiographical fiction'] } },
    { sub: 'Humor', when: { heading: ['humorous', 'satire', 'comic fiction'] } },
    { sub: 'Adventure', when: { heading: ['adventure stories', 'adventure and adventurers', 'sea stories', 'survival'] } },
    { sub: 'Christian Fiction', when: { genre: ['Christian Fiction'], heading: ['christian fiction'] } },
    { sub: 'LGBTQ+', when: { genre: ['LGBTQ+'], heading: ['gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'sexual minorit'] } },
    { sub: 'In Translation', when: { dewey: ['83', '84', '85', '86', '87', '88', '89'], lc: ['PA', 'PB', 'PC', 'PD', 'PF', 'PG', 'PH', 'PJ', 'PK', 'PL', 'PQ', 'PT'] } },
  ],
  'Nonfiction': [
    { sub: 'History', when: { dewey: ['900-909', '930-999'], lc: ['C*', 'D*', 'E', 'F'], genre: ['History'] } },
    { sub: 'Travel', when: { dewey: ['910-919'], lc: ['G'], genre: ['Travel'], heading: ['-- description and travel', 'voyages and travels'] } },
    { sub: 'Religion & Spirituality', when: { dewey: ['2'], lc: ['BL', 'BM', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BX'], genre: ['Religion & Spirituality'] } },
    { sub: 'Philosophy & Psychology', when: { dewey: ['1'], lc: ['B', 'BC', 'BD', 'BF', 'BH', 'BJ'], genre: ['Philosophy'] } },
    { sub: 'Society, Politics & Gender', when: { dewey: ['300-389'], lc: ['H*', 'J*', 'K*'], genre: ['Sociology', 'Politics, Government, Law and Public Policy', 'Sexuality and Gender Studies', 'Anthropology'] } },
    { sub: 'Arts, Crafts & Design', when: { dewey: ['700-789'], lc: ['M*', 'N*', 'TT'], genre: ['Art & Design', 'Music'] } },
    { sub: 'Science & Nature', when: { dewey: ['5'], lc: ['Q*'], genre: ['Science & Nature'] } },
    { sub: 'Health, Food & Home', when: { dewey: ['6'], lc: ['R*', 'TX'], genre: ['Health & Wellness', 'Food & Cooking'] } },
    { sub: 'Language & Writing', when: { dewey: ['4'], lc: ['P', 'PE'], heading: ['english language', 'authorship'] } },
    { sub: 'Sports & Recreation', when: { dewey: ['790-799'], lc: ['GV'], genre: ['Sports and Leisure'] } },
    { sub: 'Reference', when: { dewey: ['0'], genre: ['Reference'], heading: ['-- dictionaries', 'encyclopedias'] } },
  ],
  'Poetry': [
    { sub: 'American Poetry', when: { dewey: ['811'], lc: ['PS'] } },
    { sub: 'British & Irish Poetry', when: { dewey: ['821'], lc: ['PR'] } },
    { sub: 'Poetry in Translation', when: { dewey: ['83', '84', '85', '86', '87', '88', '89'], lc: ['PA', 'PG', 'PJ', 'PK', 'PL', 'PQ', 'PT'] } },
    { sub: 'Epic Poetry', when: { heading: ['epic poetry'] } },
  ],
  'Drama': [
    { sub: 'Shakespeare', when: { lc: ['PR2750-3112'], heading: ['shakespeare, william'] } },
    { sub: 'Classical (Greek & Roman)', when: { dewey: ['882', '872'], lc: ['PA'], heading: ['greek drama', 'latin drama'] } },
    // From about the 1880s on. 812 is all American drama; elsewhere the digits after the form are the period.
    { sub: 'Modern Drama', when: { dewey: ['812', '822.8', '822.9', '832.8', '832.9', '842.8', '842.9', '891.72'] } },
  ],
  'Myth, Folklore & Fairy Tales': [
    { sub: 'Fairy Tales', when: { heading: ['fairy tales'] } },
    { sub: 'Folk Tales & Legends', when: { heading: ['folklore', 'legends', 'tales'] } },
    { sub: 'Mythology', when: { dewey: ['201.3', '292', '293', '299'], lc: ['BL300-325'], heading: ['mythology'] } },
  ],
}

// Audience: the first match decides; a book matching neither is Adult.
export const AUDIENCE_RULES = [
  { audience: 'Teen', when: { genre: ['Teen', 'Young Adult'], heading: ['young adult fiction', 'young adult literature'] } },
  { audience: 'Kids', when: { lc: ['PZ'], genre: ['Kids', "Children's Books", 'Tween', 'Picture Books'],
    heading: ['juvenile fiction', 'juvenile literature', 'juvenile poetry', 'juvenile works', "children's stories", 'picture books'] } },
]

// ---------------------------------------------------------------------------
// The vote's translation table: what Google Books' labels and Open Library's
// subjects mean in the fixed list. Matched ignoring capitals and hyphens; a
// book gets a vote for EVERY match. '^' means the label must start that way.
// ---------------------------------------------------------------------------

export const LABEL_RULES = {
  'Fiction': {
    'Fantasy': ['fantasy'],
    'Science Fiction': ['science fiction', 'sci fi'],
    'Historical Fiction': ['fiction / historical', 'historical fiction', 'fiction, historical'],
    'Mystery & Suspense': ['mysteries', 'mystery', 'detective', 'thrillers', 'suspense', 'crime'],
    'Romance': ['romance', 'love stories'],
    'Horror': ['horror', 'ghost', 'gothic'],
    'Short Stories & Anthologies': ['short stories', 'anthologies'],
    'Literary Fiction': ['fiction / literary', 'literary fiction', 'fiction, literary'],
    'Family & Relationships': ['fiction / family', 'family life', 'domestic fiction'],
    'Coming of Age': ['coming of age', 'bildungsroman'],
    'Humor': ['humorous', 'humor', 'satire'],
    'Adventure': ['adventure'],
    'Christian Fiction': ['fiction / christian', 'christian fiction'],
    'LGBTQ+': ['lgbt', 'gay', 'lesbian', 'transgender', 'queer'],
  },
  'Nonfiction': {
    'History': ['^history'],
    'Travel': ['^travel'],
    'Religion & Spirituality': ['^religion', '^bibles', '^body, mind & spirit'],
    'Philosophy & Psychology': ['^philosophy', '^psychology', '^self help'],
    'Society, Politics & Gender': ['^social science', '^political science', '^law', '^true crime', '^business'],
    'Arts, Crafts & Design': ['^art', '^music', '^design', '^crafts', '^architecture', '^photography', '^antiques'],
    'Science & Nature': ['^science', '^nature', '^mathematics', '^technology'],
    'Health, Food & Home': ['^health', '^medical', '^cooking', '^house & home', '^gardening', '^family & relationships', '^pets'],
    'Language & Writing': ['^language arts', '^foreign language'],
    'Sports & Recreation': ['^sports', '^games', '^transportation'],
    'Reference': ['^reference', '^study aids'],
  },
  'Poetry': {
    'American Poetry': ['poetry / american', 'american poetry'],
    'British & Irish Poetry': ['english, irish, scottish, welsh', 'english poetry', 'irish poetry'],
    'Poetry in Translation': ['poetry / asian', 'poetry / european / french', 'poetry / european / german', 'poetry / middle eastern', 'poetry / russian'],
    'Epic Poetry': ['epic poetry', 'poetry / epic'],
  },
  'Drama': {
    'Shakespeare': ['shakespeare'],
    'Classical (Greek & Roman)': ['drama / ancient', 'greek drama', 'latin drama'],
    'Modern Drama': ['drama / american'],
  },
  'Myth, Folklore & Fairy Tales': {
    'Fairy Tales': ['fairy tales'],
    'Folk Tales & Legends': ['folklore', 'legends'],
    'Mythology': ['mythology'],
  },
}

// Audience in those same labels. Teen is tried first: "young adult" picks Teen.
export const AUDIENCE_LABELS = [
  { audience: 'Teen', labels: ['young adult'] },
  { audience: 'Kids', labels: ['juvenile', "children's", 'picture books'] },
]

// A label's start says which main category it points at; anything else is Nonfiction.
export const MAIN_LABELS = [
  { main: 'Comics & Graphic Novels', labels: ['^comics'] },
  { main: 'Fiction', labels: ['^fiction', '^juvenile fiction', '^young adult fiction'] },
  { main: 'Poetry', labels: ['^poetry'] },
  { main: 'Drama', labels: ['^drama'] },
  { main: 'Biography & Memoir', labels: ['^biography'] },
  { main: 'Essays, Letters & Criticism', labels: ['^literary criticism', '^literary collections'] },
  { main: 'Myth, Folklore & Fairy Tales', labels: ['folklore & mythology'] },
]
