# Cleanup list

Small data and app jobs found during the build, to deal with later. Add a job when it's found, and delete it when it's done (git keeps the history).

**This repo is public.** Describe each job and give counts or a few examples; long lists of the owner's books go in `data/reports/`, which git ignores.

**Who:** Owner = by hand in the app. Claude = script or code change. Both = Claude prepares a list and the owner decides.

## Ready now

| Job | Size | Who | Notes |
|---|---|---|---|
| Make search suggestion headings stand out | Small | Claude | Make the Titles, Authors, Series, Publisher's series, and Subjects headings bold and larger, so they read differently from the results below them. |
| Merge duplicate author names | ~15 pairs | Owner | On Edit a Book, retype the name to match the form to keep. Keep accents. Check first that it's the same person (*Mitchell, David* and *Mitchell, David T.* may not be). |
| Fix junk in author names | A few | Owner | *Raymond Original Cinema Poster*; *Lucy Maud[Canadian author](1874-1942)*; *père, Alexandre Dumas*. |
| Re-add the book removed while testing | 1 | Owner | Scan it and use Check and add. The owner knows which one; it's also in backup `2026-10-30_1345`. |
| Redo LC's title search for accented names | Up to 24 | Claude | LC's search finds nothing for accented letters ("García Márquez": 0 records, "Garcia Marquez": 7). Fixed for new searches on 2026-11-02, but 24 backlog books whose title or surname has a non-plain letter got no LC answer. Some may be just a curly apostrophe. Redo their `loc_search` (`enrich --votes --redo` does one book at a time, so it needs a list option), then `categories:save`. |
| Fall back to Open Library's L cover on the book page | Small | Claude | The book page asks for Open Library's original upload, which is broken for some covers (503) while -L and -M load. Seen 2026-11-02 on *Rosencrantz and Guildenstern Are Dead*; *Unikkaaqtuat* failed at every size, so it may need a different cover picked. If the original won't load, show -L instead; the backup's cover copy could do the same. |
| Add ISBNs to no-ISBN records | ~40 | Owner | Needs the books in hand. Run `npm run enrich` afterward. Many are Ebook and audiobook records that also need checking as physical copies. |

## Waiting on something

| Job | Waiting on | Who | Notes |
|---|---|---|---|
| Fill in publisher's series from LC and Open Library | Ready | Both | Separate pass: at least 100 copies have one listed that LibraryThing doesn't. |
| Fix over-trimmed work titles | Ready | Claude | The import cut work titles at the colon, which drops real subtitles. |
| Hide other books in the cover picker | Owner's decision | Claude | Google is searched by title words plus author, so the picker also shows the author's other books (*They Can't Kill Us…* showed *A Little Devil in America*). Could hide covers whose short title doesn't match, but a retitled or translated edition would then be hidden too. |
| Show photos at list and gallery size | First cover photos | Claude | Photos are stored at up to 2,000px and loaded at that size in lists and the gallery too (the free plan can't resize stored images). Save a small copy alongside each photo when it's taken. |
| Remove the duplicate Lumberjanes Vol. 12 | Owner | Owner | The owner thinks the second copy is an error; remove it in the app. |
| Check possible duplicate copies | Book in hand | Owner | *The Battle of the Labyrinth*, the Whitman Illuminated, *Anne of Green Gables*, *The Changeling*. Also check whether the first Harry Potter is missing. |
| Add optional series numbers | Owner's decision | Owner | Hunger Games, Hyperion Cantos, Redwall, Dory Fantasmagory, and Skandar have none so far. |
| Fix Wings of Fire graphic novel authors | Manage › Authors, or by hand | Both | #1, #2, and #5 have no author; #4 lists only "Vivibyan"; #6 misspells "Tiu T. Sutherland"; others list Tui T. Sutherland with or without Mike Holmes. |
| Number the unnumbered Narnia copies | Owner's decision, later | Both | Two copies each of *The Magician's Nephew* and *The Lion, the Witch and the Wardrobe* have no number. Publication-order set: Lion 1, Nephew 6. Story-order set: Nephew 1, Lion 2. |
| Check the edition year on *1984* | Book in hand | Owner | The record says 1961, but a 75th anniversary edition would be from around 2024. |
| Shorten the gray line where it repeats a series | Owner's decision, after using it | Both | Lumberjanes shows "Lumberjanes · Lumberjanes Comics 10" under a title that also says Lumberjanes. Long author lists also wrap to three lines. |
| Fix four books with tied author order | Manage › Authors, or by hand | Both | Two *Magic Tree House* books credit "Mary Osborne" and "Mary Pope Osborne", and two *Lion, the Witch and the Wardrobe* copies credit "C. S. Lewis" and "lewis", each pair at the same position, so their order can vary. Each is probably one person listed twice. |
| Fix two odd author names | Manage › Authors, or by hand | Both | "C Lewis" on both *Dawn Treader* copies is C. S. Lewis. *Foxfire 6* is credited to "Inc. Foxfire Fund"; the other Foxfire books to Eliot Wigginton. |
| Fix `&amp;` in publisher names | Next publisher work | Claude | 36 copies show it as text, such as "Simon &amp; Schuster"; it should be a plain "&". |
