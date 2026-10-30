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
| Redo lookups for *The Winter of Our Discontent* | Google lookup run | Claude | Clear and relook up its `loc_search` and `google` rows; they used the old title. |
| Title cleanup: move series, publisher's series, edition notes, and promotional text out of titles | Owner's rulings on the phrase list | Both | `unknown` rows ruled; `series` rows next. Then apply the rulings, back up, rerun the report, and review Check rows. Keep originals, and the vote keeps reading the original title. |
| Add series, publisher's series, and edition note fields | Title cleanup | Claude | Needs a database change, plus a saved original title. Add them to Edit a Book, and make search read the original title. |
| Fix over-trimmed work titles | Title cleanup | Claude | The import cut work titles at the colon, which drops real subtitles. |
| Raise the photo size limit | Next cover work | Claude | Photos shrink to 1,000px, too small for a large cover. |
| Re-add the book removed while testing | Scan to add | Owner | The owner knows which one; it's also in backup `2026-10-30_1345`. |
| Warn about similar author names when adding a book | Scan to add | Claude | "You have Jones, Edward P. Same person?" |
