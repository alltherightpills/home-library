# Home Library App: Project Handoff

A phone-first app for cataloging a personal library of about 1,400 books, replacing LibraryThing with something more customizable. This document collects every decision made during planning so the build can start in VS Code with Claude Code.

**Screen mockups (13 screens):** https://claude.ai/artifact/SHHe9dmFUoz1Q6pzMREC3X
(Private to the owner. All numbers and titles in the mockups are placeholders.)

---

## 1. Who this is for and how to work together

- The owner works at a public library and knows cataloging well: subject headings, call numbers, MARC concepts. They are **new to programming and app development**.
- **Explain everything in plain language.** Give the concept before the implementation ("what this is and why" before "here's the code").
- **Ask clarifying questions** whenever a choice has real tradeoffs. Don't silently pick.
- **Commit to git after every working change**, with a clear message, so any mistake can be rolled back.
- **Build in small, testable steps.** After each step, tell the owner how to see it working on their phone.
- Visual/aesthetic changes are planned for later. Get the functionality right first.

## 2. Current situation

- Collection: **~1,403 books** currently in LibraryThing (921 authors).
- Device: **iPhone only** (no iPad needed). Owner also has a **Mac**.
- Accounts: has **GitHub**. Does not yet have Supabase, Netlify, or Google Cloud accounts. Walk them through each signup when the build reaches it.
- Users: just the owner for now; **a family member may join later**, so the design must allow multiple accounts.

## 3. Platform decisions

| Decision | Choice | Why |
|---|---|---|
| App type | **Web app (PWA)** added to the iPhone home screen | No App Store, no Apple fees, instant updates, beginner-friendly |
| Framework | **React** | Popular, well supported; ideas carry over to React Native if ever needed |
| Hosting | **GitHub Pages** (free; Netlify as fallback) | Owner already has GitHub |
| Database + sign-in | **Supabase** (free tier) | Cloud backup, login, per-user data rules |
| Sign-in method | Sign in with Apple or an emailed login link | No passwords to manage; stays signed in |
| Security | HTTPS comes free from the host; database rules so each account sees only its own data | No certificate to buy |
| Offline | **Offline-first**: save to the phone first, sync to the cloud, queue automatically when offline | Bookstores often have poor signal |
| Future native app | Possible later by wrapping with **Capacitor**; data and logic carry over | Starting as a web app does not lock anything in |

Offline notes to explain to the owner: ISBN lookups need internet (save the ISBN and fill in details later); the duplicate check works offline against the on-phone copy of the catalog; iPhone web apps sync only while open, so queued changes go through the next time the app is opened.

## 4. Navigation

Bottom tab bar with **four tabs**: **Library · Reading · Scan · Pick for me**. A sliders button on the Library screen opens **Manage**.

## 5. Features by screen (matches mockup numbering)

1. **My Library (dashboard).** Totals (books, books read); search by **title or author** (catalog only); main categories with counts; banner for books that couldn't be categorized automatically; small panels for **count by year acquired** and **count by place acquired**; shortcuts to **Wishlist** and **Lent out**.
2. **Inside a category.** Main category with total count; filter All / Unread / Read; "Browse all"; list of subcategories with counts. A book can sit in several subcategories but **counts once** in the main category.
3. **Book page.** Cover with a **read checkmark badge**; title, author, first publication year, pages, ISBN; "Shelved in" categories plus the subject headings and call number that put it there; year and place acquired; **Lend it out**; reading history; start reading. Link to other editions owned ("You also own: Hardcover edition").
4. **Scan (a book you don't own).** ISBN barcode scan or typed ISBN. A **Quick add** switch adds new books without asking. "New books saved as [year · place]" stays set for the whole session, with a **Use my location** button and Change. A **"No ISBN? Add by hand"** link. Result sheet for a new book: **Add to wishlist** or **Add to library**. An offline badge shows queued scans.
   - Scanning a book **already owned** opens its book page directly.
5. **Reading.** A big "Scan a book to start" button; Currently reading list with **Finished** and **Set aside** for each book; borrowed books marked "Borrowed" (never counted in the library); recently finished books.
6. **Pick for me (recommender).** One question at a time, filtering **unread** books, with a running count of matches, previous answers shown as removable chips, and "Show picks" at any point. Questions: fiction or nonfiction → subcategory or "surprise me" → **old or new** (first published in the last 10 years) → length (short/medium/long from page count) → **international or domestic** → **character- or plot-driven**. Then 2–3 picks with a shuffle button.
7. **Browse.** Toggle between **gallery** (covers) and **list** view; sort by **date added** or **author last name (A–Z)**.
8. **Edit a book.** Every field editable: title, author last/first, first published, pages, categories (add/remove), year acquired, city / state / country with Use my location. "Remove from library" lives here, with a confirmation step. Manual category edits always override the automatic rules.
9. **Scan (different edition owned).** Matches on title + author when the ISBN is new. Options: **Open my copy** or **Add this one too**. Shown even when Quick add is on.
10. **No record found.** Lists the sources checked; guides photos of the **title page**, **copyright page**, and optional **cover**; "Fill in details from photos" or "Type it in myself."
11. **Check details.** Form pre-filled from the photos with uncertain fields highlighted and a plain-language question; categories taken from the copyright page's Library of Congress (CIP) block when present.
12. **Manage.** Sync/backup status; anything shared across many records: **Categories & rules**, **Authors** (fix names, merge duplicates), **Places acquired** (rename/merge), **Borrowers**; **Export everything as a spreadsheet**, **Import from LibraryThing**, **Restore from a backup**.
13. **Category rules.** Subcategory name and main category; rules ("subject heading contains…", "genre/form term is…", "BISAC category is…"); live count of matching books; preview; hand-added and hand-removed books noted.

Explicitly **not** wanted: shelf/room location (books move too often); collector details such as condition or signed copies.

## 6. Core data concepts

- **Copy vs. work.** Each physical copy is its own record. Copies of the same work (different editions or translations, e.g. two translations of the *Odyssey*) are **linked**. Totals: **each copy counts as a book**, but **an author counts once**.
- **Readings are separate from copies.** A reading log entry may point to an owned copy or stand alone for a **borrowed** book. This supports rereads and keeps borrowed books out of library totals. Statuses: currently reading, finished, set aside.
- **Categories.** Two levels: main category (Fiction, Nonfiction, Poetry, Drama, Biography & memoir, …) → subcategories. A book can be in several subcategories, and the system should allow (rarely) more than one main category. Counts are always distinct books.
- **Category assignment** = automatic rules **+** manual overrides (manual always wins and survives rule changes).
- **Acquisition.** Year acquired (year only) and place acquired stored as **city, state/region, country** so counts roll up at any level. This data comes from bookplates and is **not** in the LibraryThing export.
- **Wishlist**: books not owned that the owner wants.
- **Lending**: borrower (from a managed list), date lent, returned.
- **Recommender attributes**: first publication year (use the *first* published year, not the edition's), page count, international vs. domestic, character- vs. plot-driven.

## 7. Categorization: to explore first

**Goal:** derive categories from existing data rather than invent a scheme. The owner expects to need nothing more granular than **BISAC level 3** (e.g. *Fiction / Short Stories (single author)*).

**Plan:** a **crosswalk file** that maps available data to the owner's categories and handles most books automatically, while **flagging edge cases for review**. Then the app **suggests new subcategories** from patterns in the collection ("34 books have the heading *Folklore*; create a subcategory?").

**Investigate before building:**
- What Google Books actually returns in `categories` for a sample of the owner's books. It is BISAC-like but often truncated to level 1 (just "Fiction"). How often does level 3 come through?
- Whether a **published BISAC ↔ LCSH crosswalk** exists, and its license.
- **BISAC code list licensing** (maintained by BISG): whether the headings can be used in a personal app.
- What the LibraryThing export already contains (LCSH, LC classification, Dewey) that can feed the rules directly.
- Useful signals: LCSH form subdivisions (*--Poetry*, *--Fiction*, *--Juvenile literature*), LC genre/form terms (*Short stories*, *Graphic novels*, *Folklore*), headings like *Description and travel*, LC class ranges (PS = American lit., PR = British, PQ = French/Romance, etc.; also useful for international vs. domestic).
- Run the crosswalk against the full imported collection, report what percentage is auto-assigned, and list the leftovers.

## 8. Book data sources and lookup plan

Order of lookup for each ISBN: **LibraryThing export data → Open Library → Library of Congress → Google Books**. Store every result so each book is looked up only once.

- **Open Library**: no API key, no daily cap, but expects polite pacing and an identifying User-Agent. Also a source for **cover images** and first-publication year (on the work record).
- **Library of Congress**: subject headings, call numbers, genre/form terms. Check current API options and rate limits.
- **Google Books**: needs a free API key from a Google Cloud project. The owner understands the default quota as **about 1,000 requests/day** (verify the current limit). Use it only to fill gaps after the other sources.
- **Initial enrichment of ~1,400 books** runs as a slow, resumable background job that tracks progress and picks up where it left off. Expect a day or two.
- Books not found anywhere → photo flow (screens 10–11) or manual entry. An older book without an ISBN can first be searched by title + author.

## 9. LibraryThing import

- Owner will export from LibraryThing (Tools → Export). **First task: inspect the file** and list which fields exist and how complete they are.
- Map fields to the app's data model; keep the original LibraryThing data alongside, for reference.
- After import, offer a **"fill in the gaps"** mode for bookplate data: one book at a time, with one-tap buttons for recent years and recent places, so year and place can be backfilled a shelf at a time.

## 10. Photo reading (optional, later)

- For books with no record: an AI vision model (Claude API) reads the title page, copyright page, and cover and fills the form; the user always reviews before saving.
- Needs a Claude API account and key, costing a fraction of a cent per book. **The owner wants to think more about this before committing.** Ship "Type it in myself" first; add photo reading later without changing anything else.
- Character- vs. plot-driven for the recommender likely also needs an AI guess per book (spot-checked by the owner). Same decision.

## 11. Suggested build order

**Phase 1 (core, usable):**
1. Project setup: React app, GitHub repo, deploy to GitHub Pages, installable on the iPhone home screen.
2. **Prove barcode scanning works in the iPhone home-screen web app** (riskiest piece; do it in week one).
3. Supabase setup: database, sign-in, per-user rules.
4. LibraryThing import (after inspecting the export).
5. Book data enrichment job (section 8).
6. Category crosswalk + rules + review list (section 7).
7. Library dashboard, category screens, browse (gallery/list, sorting), book page, edit.
8. Scan to add, with duplicate/edition detection and Quick add.
9. Backup and spreadsheet export.

**Phase 2:** offline queue, reading tracking (current/finished/set aside, borrowed books), wishlist, lending, Manage screens (authors, places, borrowers, rules), year/place stats, bookplate backfill mode.

**Phase 3:** recommender, location autofill, photo reading, and the AI-guessed recommender attributes.

**Later ideas (not yet requested):** reading stats / year in review, series and multi-volume sets, audiobook and e-book reading entries.

## 12. Early tests to run

- Barcode scanning in Safari **and** from the home-screen app on the owner's iPhone.
- LibraryThing export: which fields are present and how complete.
- Google Books `categories` depth on a sample of 50 books.
- Crosswalk hit rate on the full collection.
- Offline: add books with airplane mode on, then reconnect and confirm they sync.

## 13. Accounts and setup (walk the owner through each when needed)

- **GitHub**: already has. Code, history, and GitHub Pages hosting.
- **Supabase**: free tier; database and sign-in.
- **Google Cloud project**: free; for the Google Books API key.
- **Claude API**: later, only if photo reading is added.

## 14. Open questions

- App name (working title needed).
- Confirm the list of main categories after seeing the crosswalk results.
- Exact length thresholds (short/medium/long) for the recommender.
- Whether to use AI for character- vs. plot-driven and for photo reading.
- Aesthetic revisions to the mockups (owner has changes planned).

## 15. Decisions made during the build

**Accounts and hosting (2026-10-26)**
- Code lives in the public repo `alltherightpills/home-library` (personal GitHub account, not the work account `dpl-zrh`). This project's git config uses `gh` credentials so pushes go out as `alltherightpills`.
- Live at https://alltherightpills.github.io/home-library/, deployed by GitHub Actions on every push to `main`.
- Supabase project `fafbtvvrhopkhnlmekeu` (East US, Ohio). Free tier pauses after 7 days of no use; data is kept.
- No personal data ever goes in the repo. The `data/` folder (LibraryThing exports, backups) is git-ignored.

**Sign-in**
- **Email + password**, saved by iPhone Keychain. Sign in with Apple needs a paid Apple Developer account. Emailed links open in Safari, not the home-screen app. Emailed codes need editable email templates, which Supabase only allows with custom SMTP.
- New sign-ups are turned off in Supabase. Turn back on briefly if a family member joins, or add the account by hand (Authentication → Users → Add user). The app's sign-in screen has no sign-up option (removed 2026-10-28).

**Sharing (database design)**
- One **shared household library**. Books, works, and authors belong to a library, not a person; `library_members` says who can use it, and every member can do everything. Reading history (Phase 2) will be per person within the library.
- `my_library()` returns the signed-in person's library, creating "Home Library" if they have none. To add a family member: they create an account, an admin adds a `library_members` row for them, and only *then* do they open the app (otherwise they get their own empty library).
- Database changes live in `supabase/migrations/`, run by pasting into Supabase's SQL Editor.
- Not built yet: "Forgot password."

**Scanning**
- Barcode scanning works in Safari and the home-screen app (tested on the owner's iPhone). Uses the `barcode-detector` polyfill with the zxing engine bundled locally for offline use.
- iOS asks for camera permission on each launch of the home-screen app. Accepted for now; a Capacitor wrapper would fix it.
- To add in "Scan to add": a typed-ISBN box accepting ISBN-10 and ISBN-13, and a hint when a UPC (store) barcode is scanned. Older mass-market paperbacks often have only a UPC on the back, with the ISBN barcode inside the front cover or the ISBN printed on the copyright page.

**LibraryThing export findings**
- Use the **JSON** export. The MARC export is almost entirely LibraryThing "basic" records (1,399 of 1,403) with no subject fields; the TSV lacks subject headings.
- 1,403 books, 935 distinct primary authors. ISBN on 1,360. LC call number 97%, Dewey 97%, LT genre 75%, subject headings 47% (split into heading + subdivisions, no MARC subfield codes). Page count 84%.
- 97.5% of books have at least one category signal (subject, LT genre, or LC class); 35 have none.
- The `date` field is the **edition** year, not first publication. First publication must come from Open Library during enrichment.
- LibraryThing's work ID links 22 works with 2+ copies (44 books).
- Acquired, From Where, Date Read, Tags, Ratings, and Lending are all empty.
- Imported 2026-10-26 with `npm run import:lt` (1,403 copies, 1,381 works, 1,075 people).

**Enrichment (2026-10-26)** (`npm run enrich`, rerunnable; fills blanks only)
- Sources: Open Library search API (no key; 1 request/second) and the LC catalog via SRU at `lx2.loc.gov:210/lcdb` (MARCXML; ISBN-10 first, then ISBN-13; 1 request every 2 seconds). Every answer is stored in `lookups`. Google Books not used yet; revisit only if Step 6 shows a gap it would fill.
- Results: Open Library found 1,301 of 1,355 ISBNs; LC found 710. Filled first-published year for 1,269 works, covers for 1,192 books, LC subject headings (with subfields) for 632, LC call numbers for 700.
- First-published year = the earliest of Open Library's `first_publish_year` and LC 008's original date for reprints (type `r`), ignoring years later than the edition. Stored with its source.
- Covers use Open Library cover IDs (work-level, so sometimes another edition's cover). ISBN-based cover lookups are rate-limited (100 per 5 minutes), so not used for browsing.
- The catalog is **physical books only**. 19 "Ebook" and 5 "Digital audiobook" records (plus *Shakespeare's Stratford*, "Other") are errors, usually from picking a Kindle/Audible listing when a UPC wouldn't scan; 20 of them have no ISBN. Import them as physical and flag them "Needs checking" so the owner can rescan or fix them. "Paper Book" is just another print label, not an error.

**Backup and restore (2026-10-28)**
- `npm run backup` signs in (the app's account) and saves a dated snapshot to `~/Documents/Home Library Backups` (iCloud-synced, outside the repo): every table as JSON, a readable `books.csv`, and `info.json`. Keeps the newest 30 runs. Cover photos go to a shared `photos/` folder that only grows. Manual for now; run it before any bulk data change.
- `npm run restore [-- <snapshot>]` shows a plan and writes nothing until RESTORE is typed, then reads everything back and checks it. Into the same library it puts back changed/deleted rows and removes rows added since. Into a *different, empty* library it copies everything with new ids: that is how it was tested (hand-made test account, all 1,403 books verified, then deleted) and how to rebuild in a new Supabase project.

**Categories (in progress, 2026-10-28)**
- Decided: 8 main categories: Fiction, Nonfiction, Poetry, Drama, Comics & graphic novels, Biography & memoir, Myth folklore & fairy tales, Essays letters & criticism. Kids / Teen / Adult is an **audience label** on every book, not a category. Travel writing is Nonfiction › Travel. Subcategories come from the collection's own data, not BISAC.
- The owner's category list is a **fixed vocabulary**: rules may only suggest from it. Raw cataloging data (LC headings, genre/form terms, Dewey, LC class, Open Library subjects) stays in the database for searching but not on the book page; the book page gets a collapsed "Cataloging details" section instead.
- Rules: `src/categories/category-rules.js` (first match wins for the main category: Dewey, then headings, LC class, LibraryThing genre, title). Engine: `src/categories/categorize.js`. `npm run categories:report` runs them on the newest backup (no sign-in) and writes `data/reports/categories-<snapshot>.csv` with the clue behind every choice.
- First pass: 91% decided by Dewey; 10 books with no category. Dewey quirks handled: 89x puts the form digit after the language (895.63 = Japanese fiction); 808.8x anthologies; classical 88x/87x; biographies are marked by 092 within their subject. 8x8/808 "miscellaneous" is a grab bag (Poe's tales land in Essays); individual misfits (*Waiting for Godot*, *One Hundred Years of Solitude*) are for manual overrides, not rules.
- Books added later have no LibraryThing data. Tested on the current collection using only LC + Open Library: classification alone gives a main category for 70% (94% matching the full-data result); adding Open Library subjects as a fallback reaches 89% (fallback guesses ~73% right). Plan for Scan to add: classification-decided books filed automatically, fallback guesses shown for one-tap confirmation, the rest picked by hand. Open Library subjects need normalizing (case, hyphens) and variant lists (*sci-fi*, *Science-Fiction*, BISAC strings).

**Categories: list settled (2026-10-29)**
- Names are in Title Case, main and sub ("Comics & Graphic Novels", "Science Fiction"). Treat them as fixed: yearly reports compare by name, so a rename splits a category.
- Fiction: Fantasy, Science Fiction, Historical Fiction, Mystery & Suspense, Romance, Horror, Short Stories & Anthologies, Literary Fiction, Family & Relationships, Coming of Age, Humor, Adventure, Christian Fiction, LGBTQ+, In Translation. Nonfiction, Poetry, Drama and Myth keep their first-pass subcategories; Comics, Biography and Essays have none.
- No catch-all: a book matching no subcategory stays blank and goes to the review list. "Literary Fiction" is a real subcategory, assigned from evidence ("Fiction / Literary", "literary fiction").
- Title clues ignore bracketed text (series names: "(Vega Family Love Stories)"). Fiction with no subcategory: 228 → 98 using each book's own record only.
- Fantasy does not use "mythology" as a clue (Myth, Folklore & Fairy Tales is its own main category).
- **Anthologies** are filed by what they contain: fiction anthologies → Fiction › **Short Stories & Anthologies** (renamed from Short Stories; clues: Dewey 808.83, `*0108`, `8x3.x08`, "antholog…" headings, "anthology" in the title); poetry and drama anthologies stay in Poetry and Drama. Nonfiction anthologies were meant to go to Essays, Letters & Criticism, but no rule yet: the only "anthologies" among the nonfiction are two DK children's picture books and McSweeney's 73, so file real ones by hand and revisit after Google's data is in.
- Every **McSweeney's** issue is Fiction › Short Stories & Anthologies (a title rule ahead of all others; 5 issues had fallen into Comics via LibraryThing and #73 into Nonfiction via Dewey 111.85).
- Biography's `*092` rule skips `*08092` (collections by a group of people, 823.0108092) and `8x0.8` (collections of one literature).
- Idea for the voting step: Dewey `8x3.087x` encodes fiction **genre** (823.0876 fantasy, 823.0872 detective, 813.0876 science fiction, 823.0873 ghost/horror). A strong own-record clue not yet used.
- Waiting for manual choices (step 4): *Female Lines* (a story collection; Dewey 820.809287 puts it in Essays) → Fiction › Short Stories & Anthologies; *The Gathering Dark* (folk horror anthology, Dewey 808.80 → Essays) → Fiction; *Argos* and *Percy Jackson's Greek Heroes* (myth retellings) → probably Myth, Folklore & Fairy Tales; *Waiting for Godot*, *One Hundred Years of Solitude*.
- Why so many blanks: LC found only 710 of 1,355 ISBNs, and 72 of the 105 have no headings at all. Tested on the Fiction gap: LC searched by **title + author** (`dc.title="…" and bath.author="<surname>"`, keep records whose 245 starts with the title) finds another edition for 108 of 148, 87 with headings (42 that had none). Google Books: `isbn:` still mostly fails, but a word search (title + author name) found the right book 14 of 15, and its volume detail record gives publisher BISAC labels ("Fiction / Short Stories (single author)"), the best genre clue of the three. Open Library work subjects (already in `lookups`) are pooled across editions and noisy for famous classics (*Moby-Dick* → Science fiction).
- **Planned: weighted vote across sources** (owner's design, 2026-10-29). Each source's labels are translated into votes for the fixed list; weights to start: own catalog record 3, LC other editions 2, Google best match 2, Open Library 1; threshold 3 (so Open Library alone never decides). Then a ~40-book right/wrong sample from the owner to tune the weights. The vote decides **subcategories and audience** only; Dewey/LC class keeps deciding the main category, and strong disagreement flags the book for review. LibraryThing genres are a check, not a voter, so books added later are judged the same way. Audience needs the vote too (it leans on LibraryThing today): "juvenile fiction" means Kids or Teen; "young adult" picks Teen.
- The vote must also run when a book is added (Scan to add). So the engine and the lookup functions go in `src/` (shared by app and scripts). LC's SRU server is http-only with no CORS, so the app will need a small relay (Supabase Edge Function) for LC; Google and Open Library can be called from the app. The Supabase CLI is not installed; build the relay with step 8, not before.
- **One main shelf + "also in"** (decided 2026-10-29): every book has exactly one main category, which reports count (so yearly totals add up), plus optional extra main categories, each with their own subcategories, where it also appears in browsing and search. Rules pick only the main shelf; "also in" is the owner's choice for now (the vote may later suggest one). Examples: myth retellings (*A Thousand Beginnings and Endings*: Fiction › Short Stories & Anthologies, also Myth, Folklore & Fairy Tales), graphic memoirs, travel memoirs, novels in verse. Build this into the category tables in step 4.
- Order agreed: (1) list settled ✓; (2) enrichment also saves LC title/author search and Google best match for every book (raw answers in `lookups`, so rule changes never need refetching; Google's 1,000/day cap means ~3 days for ~2,800 calls); (3) voting engine in `src/`, tested on the backlog, weights tuned; (4) category tables (manual choices always win), review list, book page; (5) relay + Scan to add in step 8.
- Step (2) built (2026-10-30): `npm run enrich -- --votes` saves sources `loc_search` and `google` in `lookups`; books with no ISBN use the key `copy:<id>`. Google picks the exact ISBN, else the same title and author, and prefers an edition with labels. It stops for the day at Google's cap while LC carries on; rerun to continue. On a 21-book sample: LC 18, Google 19, 14 with detailed labels before the prefer-labels change. Google's labels are noisy (*Griffin & Sabine*: Biography; *Out of Africa*: Fiction / Literary), which is what the vote is for. Not-found answers are saved and not retried.
- Step (3) first version (2026-10-30): `src/categories/vote.js` (counting), `LABEL_RULES`/`AUDIENCE_LABELS`/`MAIN_LABELS` in `category-rules.js` (translation), `npm run categories:vote` (reads the newest backup, changes nothing, writes `data/reports/votes-<snapshot>.csv`). Choices made: an audience of Kids or Teen needs 3 votes together, Teen needs 2 of its own; each source votes once per choice however many records match; LC editions count toward a main-category flag only when they agree, and the flag needs more votes than the rules' choice and at least 4. Also added Dewey genre digits to the Fiction rules (8x3.081, .085, .0872, .0873, .08762, .08766). Not yet tuned or tried on real LC and Google answers: a baseline on own record + Open Library only gives 174 Fiction books no subcategory and 8 teens (the old rules, leaning on LibraryThing, gave 98 and 45), which is expected to improve once the answers are in. Next: rerun after each backup, then the owner's ~40-book check once Google is finished.
