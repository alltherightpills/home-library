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
