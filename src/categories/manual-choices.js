// Choices the owner made by hand, before the app has a screen for them. Each
// names one book and its main shelf and subcategories, its "also in" shelves, or both.
// `npm run categories:setup` saves them; a book that already has an owner's
// choice in the database is left alone.

export const MANUAL_CHOICES = [
  { copyId: '1665497a-3040-4f99-9188-988f4c602b93', title: 'Female Lines: New Writing by Women from Northern Ireland',
    main: 'Fiction', subs: ['Short Stories & Anthologies'] },
  { copyId: '3aeb16bc-7398-471f-a4d2-88d21ee931ac', title: 'Gathering Dark, The: An Anthology of Folk Horror',
    main: 'Fiction', subs: ['Short Stories & Anthologies', 'Horror'] },
  { copyId: '02ce3836-7275-413b-aa41-e68f7aa0124a', title: 'Argos: The Story of Odysseus as Told by His Loyal Dog',
    main: 'Fiction', subs: ['Fantasy'], also: [{ main: 'Myth, Folklore & Fairy Tales', subs: ['Mythology'] }] },
  { copyId: 'c5d61ca8-4699-4d13-a68c-05de0801e481', title: "Percy Jackson's Greek Heroes",
    main: 'Myth, Folklore & Fairy Tales', subs: ['Mythology'] },
  { copyId: '361383a4-e3c6-48a9-b976-382d9789ec6d', title: 'Waiting for Godot',
    main: 'Drama', subs: ['Modern Drama'] },
  { copyId: 'b05b75db-10b3-44c6-8a1a-1e889082df30', title: 'One Hundred Years of Solitude',
    main: 'Fiction', subs: ['In Translation'] },
  // Crosslisted only: the vote still chooses their main shelf and subcategories.
  { copyId: '084e9a50-0bac-4406-89da-c5572dbd1ebc', title: 'Circe',
    also: [{ main: 'Myth, Folklore & Fairy Tales', subs: ['Mythology'] }] },
  { copyId: '0f70b771-3802-4dd2-8a65-a043a197ab16', title: 'The Song of Achilles: A Thrilling Retelling of the Legend of Achilles and the Trojan War',
    also: [{ main: 'Myth, Folklore & Fairy Tales', subs: ['Mythology'] }] },
]

// The rows one choice becomes. `ids` finds a category's id from its main and sub names.
export function rowsForChoice(choice, libraryId, ids) {
  const reasons = ['Chosen by the owner']
  const row = (name, sub, is_main = false) => ({
    library_id: libraryId, copy_id: choice.copyId, category_id: ids(name, sub),
    is_main, set_by: 'owner', reasons,
  })
  const shelf = ({ main, subs = [] }, is_main) => [row(main, null, is_main), ...subs.map((sub) => row(main, sub))]
  return [...(choice.main ? shelf(choice, true) : []), ...(choice.also ?? []).flatMap((s) => shelf(s, false))]
}
