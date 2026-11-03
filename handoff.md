# Home Library App: Handoff

A phone-first web app (installed on the owner's iPhone home screen) for cataloging a personal library of about 1,400 books, replacing LibraryThing. This file says **how things are now**. The reasons behind decisions, test results, and the build diary are in [decisions-log.md](decisions-log.md); where the two disagree, this file wins. Small jobs found along the way go in [cleanup.md](cleanup.md).

**Screen mockups (13 screens):** https://claude.ai/artifact/SHHe9dmFUoz1Q6pzMREC3X (private to the owner; numbers and titles are placeholders).

**Keeping this file current:** when a step finishes or a decision changes how something works, update the section it belongs to here, in a sentence or two. Don't append dated diary entries; put long reasoning or test numbers in `decisions-log.md` if they're worth keeping.

---

## 1. Working together

- The owner works at a public library and knows cataloging well: subject headings, call numbers, MARC concepts. They are **new to programming and app development**.
- **Explain everything in plain language.** Give the concept before the implementation ("what this is and why" before "here's the code").
- **Ask clarifying questions** whenever a choice has real tradeoffs. Don't silently pick.
- **Commit to git after every working change**, with a clear message, so any mistake can be rolled back.
- **Build in small, testable steps.** Agree each step's slices with the owner before building. After each slice, tell the owner how to see it working.
- **Database change first, then the code.** Run a new migration in Supabase before pushing code that uses it. The catalog loads in one request naming every column it needs, so a column the database doesn't have yet means the app shows no books at all.
- **Back up before any bulk data change** (`npm run backup`).
- The owner tests every change on the iPhone after it's pushed.
- **Function first.** The look of the screens waits for a later design pass.
- **The repo is public.** No personal data in it: lists of the owner's books go in `data/` (git-ignored), and keys and passwords in `.env.local` (git-ignored).

## 2. Where things stand (2026-11-03)

- **Phase 1 is finished:** scanning, the LibraryThing import, enrichment, categories and the review list, the Library screens, Scan to add, backup/restore, and the spreadsheet export.
- **Phase 2:** step 0 (iPhone shakedown), step 1 (reading tracking) and step 2 (shelf walk) are built. The owner is walking the remaining shelves.
- **Next:** the "do now" cleanup items from the 2026-11-03 audit (in `cleanup.md`), then Phase 2 step 3.

**Phase 2 order (remaining):**
3. Year/place stats on the dashboard (count by year acquired and by place acquired).
4. Manage, part one: the hub (a sliders button on Library), Authors (rename everywhere, merge duplicates), Places (rename and merge), and Export in the app (`src/export/bookSheet.js` was built for this). Manage shows backup and restore as Mac-only.
5. Lending + Borrowers (borrowers from a managed list; date lent, returned). Build its saves as all-or-nothing database functions (see `cleanup.md`).
6. Wishlist: **its own list**, separate from the library and never counted in totals. Buying one moves it into the library through the normal check form. Scan gets Add to wishlist and notices a scanned wishlist book.
7. Offline, only (a) the catalog saved on the phone, so the owned check works with no signal, and (b) scanned ISBNs saved with no signal and looked up later. Everything else stays online-only.

**Phase 3:** Pick for me (the recommender), Use my location for places, photo reading of title and copyright pages, and AI-guessed recommender attributes.

**Deferred:** the Category rules editor (screen 13). Rules stay in `src/categories/category-rules.js`, changed with Claude; the review list handles exceptions. **Dropped:** Quick add on Scan (the check form's Save and next already moves through a pile, and unchecked records would get in), and Import from LibraryThing in Manage (done once).

## 3. Accounts, hosting, and setup

- **Code:** the public repo `alltherightpills/home-library` (the owner's personal GitHub account, not the work account `dpl-zrh`). Pushes use `gh` credentials. Commits are signed with GitHub's private no-reply address.
- **Live app:** https://alltherightpills.github.io/home-library/, built and published by GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`.
- **Supabase** project `fafbtvvrhopkhnlmekeu` (East US), **free plan**: no automatic backups, and it **pauses after 7 days with no use** (data is kept; unpause from the Supabase dashboard). Stored files have a 1 GB limit, and stored images can't be resized on the fly.
- **Database changes** live in `supabase/migrations/`, run by pasting into Supabase's SQL Editor.
- **The LC relay** (`supabase/functions/loc/index.ts`) is deployed with `supabase functions deploy loc --project-ref fafbtvvrhopkhnlmekeu --use-api`. The Supabase CLI is installed with Homebrew and signed in.
- **Google Books keys:** the app's key is in `src/googleBooks.js` (public by design; Google accepts it only from the live site and `localhost`, for the Books API only). The scripts' key is `GOOGLE_BOOKS_KEY` in `.env.local`.
- **Sign-in:** email + password (saved by iPhone Keychain). Sign-ups are off in Supabase, and the app has no sign-up screen. "Forgot password?" and Change password are built (`src/PasswordForm.jsx`); Supabase's URL Configuration must allow the live address. Test password changes on the test account, not the real one.
- **Adding a family member:** create their account by hand (Supabase › Authentication › Users › Add user), add a `library_members` row for them in your library, and only then let them sign in to a terminal script. The app never creates a library, but `my_library()` (used by the scripts) creates an empty one for an account that has none.
- **Two-factor sign-in** is on for the owner's GitHub, Supabase, and Google accounts. It doesn't affect the scripts, which sign in with the app's own account.

## 4. The screens

A bottom tab bar with four tabs: **Library · Reading · Scan · Pick for me** (a placeholder until Phase 3). One search bar, above the tab bar, shows on every screen except Scan, the password form, and screens with their own bottom buttons or a form. On the iPhone the tab bar hides while typing a search.

- **Library (dashboard):** book total and books read (tap for All books with Read on), the review banner, main categories with counts, Browse all, the Shelf walk button with progress, and Series / Publisher's series buttons. Typing a search shows matching books here.
- **Lists** (search results, All books, categories, subcategories, series): sort by author, title, or date added; List / Gallery (remembered on the phone); All / Unread / Read (not remembered, so it can't hide books unnoticed). All books also has Needs checking and Not walked yet.
- **Category screens:** a main category's count is the books whose **main shelf** it is, so counts add up to the library; books "also in" it are listed too and marked. A subcategory lists every book on it.
- **Review categories:** books with `category_review`, filtered by No main category, Sources disagree, No subcategory, Tentative. **Save and next is a decision even with nothing changed:** the shelves become the owner's and the book leaves the list.
- **Book page:** cover (with a ✓ once read), title, authors, "You also own" (other copies of the same work), Shelved in / Also in, details, series links, Reading section, collapsed Cataloging details, Edit book.
- **Edit a Book:** every field, including categories, audience, series, acquired year and place, ISBNs, and Needs checking with a note; Remove from library. Title, pages and bookplate fields change this copy only; first published and people belong to the work, so every copy shows them. Correcting a person's name changes **this work only**; renaming someone everywhere is for Manage › Authors.
- **Cover picker:** Open Library and Google covers with their full sizes, a photo of your copy (stored, up to 2,000px), or Search Google Images ↗ to save one to Photos first.
- **Scan:** scan or type an ISBN. An owned book opens its page. A new one is looked up and shown, then **Check and add** goes through every book scanned this session, oldest first, in the check form (cleaned title, authors split last/first with "Same person?" warnings, series, categories from the vote, year and place). **New books saved as [year · place]:** the place is remembered on the phone; the year is this year every time the app opens. **Add by hand** searches LC editions and Open Library works by title, optional author and year, or lets you type it in.
- **Reading:** scan a book to start or finish it; Currently reading, Recently finished, Set aside. Borrowed books are readings only (never in the library), with an optional Borrowed from and Find a cover, and are edited on this tab.
- **Shelf walk:** scan (or find by title) each book on the shelves; a card for year acquired (a scroll wheel), place (City, State; country defaults to USA), and Read? Yes/No. Books not in the catalog are added from the card through the check form.

## 5. How the data is organized

- **One shared household library.** `libraries` and `library_members`; every table belongs to a library, and the database's rules let members see and change only their own library. Every member can do everything except see others' reading.
- **Copy vs. work.** `copies` is one row per physical book (each counts as a book). Copies of the same work (other editions, translations) share a `works` row, which holds the first-published year (with its source; blank source = entered by hand) and the people (`work_authors` → `authors`, with role and position). An author counts once.
- **Series:** `series` and `publisher_series` are shared lists with `aliases` for other spellings (like authority control); `copy_series` and `copy_publisher_series` link a copy with its own printed number and position. A book can have two series labels. Shown as "Name #3".
- **Categories:** `categories` holds the owner's fixed list, two levels (a subcategory points at its main category). Names are Title Case and treated as fixed, since reports compare by name. 8 main categories: Fiction; Nonfiction; Poetry; Drama; Comics & Graphic Novels; Biography & Memoir; Myth, Folklore & Fairy Tales; Essays, Letters & Criticism. **Audience** (Kids / Teen / Adult) is a label on each copy, not a category.
- `book_categories`, one row per shelf per copy: `is_main` marks the one main shelf (others are "also in"); `set_by` is 'vote' or 'owner', and **the vote never overwrites 'owner'**; `removed` remembers a shelf the owner took off; `tentative` marks a weak (2-vote) subcategory; `reasons` holds the votes. `copies.category_review` (`{ flags, suggestions }`) puts a book on the review list.
- **Readings** (`readings`) are per person: a copy, or a borrowed book's title/author/ISBN/cover. Status reading, finished, or set aside, with dates (a past read has none). **Read is per work:** a finished reading of any copy marks every copy of that work read. Set aside doesn't count. Removing a copy keeps everyone's readings of it (a database trigger copies its title, authors and ISBN onto them).
- **Acquisition:** `acquired_year`, `acquired_city`, `acquired_region`, `acquired_country` on each copy (from bookplates); `shelf_walked_on` is the date it was walked.
- **Lookups:** `lookups` stores every raw answer from Open Library, LC, and Google by source and ISBN (or `copy:<id>` for a book with none), so rule changes never need fetching again.
- **Cataloging data** (LC subjects and call number, Dewey, LC class, LibraryThing subjects and genres, the original LibraryThing record) stays on each copy for search and the vote, shown only under Cataloging details.
- **Covers:** links, not files: an Open Library `cover_id`, or a `cover_url` (Google, or a picked one). Only photos are stored, in the Supabase bucket `covers` under the library's id. Anyone with a photo's exact address can open it; nobody can list them.
- **Not wanted:** shelf or room location, and collector details (condition, signed copies).

## 6. How the main parts work

- **Loading:** `useCatalog` (`src/useCatalog.js`) loads every copy with its work, people, shelves and series once at sign-in, 1,000 at a time, and adds display fields (byline, sort keys, search text). Saves update the screen's copy directly; nothing reloads until the app is reopened. `useReadings` does the same for readings.
- **Navigation:** each screen inside the Library tab (a book, a category, a series, the walk) is a step in the browser history, so iPhone swipe-back and Back work. `App.jsx` handles tabs and jumping to the Library from another tab (`goToLibrary`); `Library.jsx` handles its own screens (`openBook`, `openPlace`). This is the most intricate code; change it carefully.
- **Book lookups** (shared by the app and scripts: `src/bookLookups.js`, `src/locLookups.js`, `src/googleBooks.js`, `src/scanLookup.js`):
  - **Open Library:** no key; pace about 1 request a second with an identifying User-Agent. Gives junk for made-up ISBNs, so the check form always shows the record before saving.
  - **Library of Congress:** the SRU server `lx2.loc.gov:210/lcdb` (MARCXML). It's http-only and blocks other websites, so the app asks through the LC relay; scripts ask directly, 1 request every 2 seconds. Searches find nothing with accented letters, so they're sent without accents. A search returns at most 10 records, newest first.
  - **Google Books:** about 1,000 requests a day. `isbn:` searches have mostly failed since 2026-10-29, so it searches by title + author; its detail records give publisher genre labels (BISAC), the best genre clue of the three.
- **Categories:** `src/categories/category-rules.js` (the rules), `categorize.js` (picks the main shelf, Dewey first), `vote.js` (each source's labels become votes for subcategories and audience: own record 3, LC other editions 2, Google 2, Open Library 1; threshold 3, so Open Library alone never decides), `voteResults.js` (votes → shelf rows and review notes), `review.js` (what a decision on the review list or Edit a Book writes), `manual-choices.js` (the owner's fixed choices). The vote runs on each new book when it's added.
- **Titles:** `src/titles/cleanTitle.js` with the owner's rulings in `phrase-rulings.js` removes form labels ("A Novel") and promotional text, and moves series, publisher's series and edition notes to their own fields. The original is kept in `original_title`, and search reads it. Used on every new book.
- **Covers on screen:** `coverUrl(copy, size)` asks for a size that fits where it's shown. The built app keeps every cover on the phone after it's first shown (`runtimeCaching` in `vite.config.js`), so they show instantly afterwards; this only works in the built app, not `npm run dev`.
- **Scanning:** the `barcode-detector` polyfill with the zxing engine bundled in the app. `src/IsbnReader.jsx` (camera + ISBN box) is shared by Scan, Reading and the shelf walk.

## 7. Terminal commands

Every script signs in with the app's account (email and password) unless it reads a backup. **Scripts that change the library show their plan and save nothing unless run with `-- --apply`, which needs a backup matching the library and a typed confirmation word.** Don't back up or apply while a Google lookup run is going.

| Command | What it does |
|---|---|
| `npm run dev` | Live preview on the Mac. `-- --host` opens it on the phone too, but there the camera won't work (needs https) and Google refuses the key (wrong address). Test those on the live site. |
| `npm run build` | Builds the app (GitHub does this on every push). |
| `npm run lint` | Checks the code for common mistakes. |
| `npm run backup` | Dated snapshot to `~/Documents/Home Library Backups` (iCloud): every table as JSON, `books.csv`, plus shared `photos/` and `covers/` folders that only grow. Keeps the newest 30 runs. |
| `npm run restore [-- <snapshot>]` | Shows a plan; writes nothing until RESTORE is typed. Into the same library it undoes changes since the snapshot; into an empty one it copies everything (how to rebuild in a new Supabase project). |
| `npm run export` | Spreadsheet to `~/Downloads/Home Library <date>.xlsx`; `-- --backup` reads the newest backup instead. |
| `npm run enrich` | Fills blanks from Open Library and LC (hand edits stay). `-- --votes` also saves LC title searches and Google matches for the vote. Rerunnable. Needed after typing an ISBN into an existing book. |
| `npm run categories:save` | Saves the vote's shelves, audience and review notes; never touches the owner's. |
| `npm run categories:report` / `categories:vote` | Reports on the newest backup to `data/reports/`; changes nothing. |
| `npm run categories:setup` | Loads the category list and manual choices; adds only what's missing. |
| `npm run covers:upgrade` | Moves covers to a sharper image of the same edition; lists small covers to photograph. |
| `npm run works:split -- "<title>"` | Gives a copy its own work, for two books wrongly filed as one. |
| `npm run titles:report` / `titles:apply` | The title cleanup (applied 2026-11-01). Rerunning re-adds series removed by hand, so only to finish a stopped run. |
| `npm run import:lt` | The LibraryThing import (done 2026-10-26). |

## 8. Known limits and gotchas

- **iPhone camera permission** is asked on each launch of the home-screen app. A native wrapper (Capacitor) would fix it; accepted for now.
- **Safari's ⌃ ⌄ ✓ bar** above the keyboard can't be removed by a web app.
- **Store (UPC) barcodes:** older mass-market paperbacks often have only a UPC on the back; the ISBN barcode is inside the front cover, or the ISBN is on the copyright page. Scan shows a hint.
- **No signal:** the catalog doesn't load, so nothing shows (fixed by Phase 2 step 7a).
- **Open Library covers** are slow (1–4 seconds each) and sometimes fail at full size; Open Library covers are per work, so sometimes another edition's.
- **The catalog doesn't refresh** while the app stays open: changes from another phone or a script show after reopening.

## 9. Open questions

- App name (working title needed).
- The recommender's length thresholds (short / medium / long), and whether to use AI for character- vs. plot-driven and for photo reading (the owner wants to think about it; it would need a Claude API account).
- The design pass for every screen.
