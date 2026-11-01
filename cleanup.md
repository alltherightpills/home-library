# Cleanup list

Small data and app jobs found during the build, to deal with later. Add a job when it's found, and delete it when it's done (git keeps the history).

**This repo is public.** Describe each job and give counts or a few examples; long lists of the owner's books go in `data/reports/`, which git ignores.

**Who:** Owner = by hand in the app. Claude = script or code change. Both = Claude prepares a list and the owner decides.

## Ready now

| Job | Size | Who | Notes |
|---|---|---|---|
| Merge duplicate author names | ~15 pairs | Owner | On Edit a Book, retype the name to match the form to keep. Keep accents. Check first that it's the same person (*Mitchell, David* and *Mitchell, David T.* may not be). |
| Fix junk in author names | A few | Owner | *Raymond Original Cinema Poster*; *Lucy Maud[Canadian author](1874-1942)*; *père, Alexandre Dumas*. |
| Add ISBNs to no-ISBN records | ~40 | Owner | Needs the books in hand. Run `npm run enrich` afterward. Many are Ebook and audiobook records that also need checking as physical copies. |

## Waiting on something

| Job | Waiting on | Who | Notes |
|---|---|---|---|
| Title cleanup: move series, publisher's series, edition notes, and promotional text out of titles | New fields | Both | Line-by-line review finished 2026-10-31. Back up, confirm, and apply once the fields exist. Keep originals, and the vote keeps reading the original title. |
| Fill in publisher's series from LC and Open Library | New fields | Both | Separate pass: at least 100 copies have one listed that LibraryThing doesn't. |
| Show publisher's series and edition note on the main list | Title cleanup | Claude | Release with the cleanup: moving "(The Pelican Shakespeare)" out of titles removes what tells editions apart on the main screen. Add them to the author and year line. |
| Fix over-trimmed work titles | Title cleanup | Claude | The import cut work titles at the colon, which drops real subtitles. |
| Raise the photo size limit | Next cover work | Claude | Photos shrink to 1,000px, too small for a large cover. |
| Re-add the book removed while testing | Scan to add | Owner | The owner knows which one; it's also in backup `2026-10-30_1345`. |
| Remove the duplicate Lumberjanes Vol. 12 | Owner | Owner | The owner thinks the second copy is an error; remove it in the app. |
| Check possible duplicate copies | Book in hand | Owner | *The Battle of the Labyrinth*, the Whitman Illuminated, *Anne of Green Gables*, *The Changeling*. Also check whether the first Harry Potter is missing. |
| Add optional series numbers | Owner's decision | Owner | Hunger Games, Hyperion Cantos, Redwall, Dory Fantasmagory, and Skandar have none so far. |
| Fix Wings of Fire graphic novel authors | Manage › Authors, or by hand | Both | #1, #2, and #5 have no author; #4 lists only "Vivibyan"; #6 misspells "Tiu T. Sutherland"; others list Tui T. Sutherland with or without Mike Holmes. |
| Number the unnumbered Narnia copies | Owner's decision, later | Both | Two copies each of *The Magician's Nephew* and *The Lion, the Witch and the Wardrobe* have no number. Publication-order set: Lion 1, Nephew 6. Story-order set: Nephew 1, Lion 2. |
| Check the edition year on *1984* | Book in hand | Owner | The record says 1961, but a 75th anniversary edition would be from around 2024. |
| Fix two odd author names | Manage › Authors, or by hand | Both | "C Lewis" on both *Dawn Treader* copies is C. S. Lewis. *Foxfire 6* is credited to "Inc. Foxfire Fund"; the other Foxfire books to Eliot Wigginton. |
| Fix `&amp;` in publisher names | Next publisher work | Claude | 36 copies show it as text, such as "Simon &amp; Schuster"; it should be a plain "&". |
| Warn about similar author names when adding a book | Scan to add | Claude | "You have Jones, Edward P. Same person?" |
