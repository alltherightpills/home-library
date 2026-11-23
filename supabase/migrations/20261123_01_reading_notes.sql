-- Home Library: Claude's reading notes for each book (Phase 3, Pick for me
-- slice D). Adds one empty column to works; no book data changes when this is
-- run.
--
-- The "Why" line Claude writes beside each book's answers in an assessment
-- pass, rewritten for a reader: what reading the book is like (pace, tone,
-- whose eyes it looks through). Shown on the book page under the synopsis as
-- "Reading notes (Claude)", hidden once the owner has set all four answers
-- (owner's choices, 2026-11-23). Kept apart from the synopsis, which stays
-- short for Pick for me, and not editable in the app: only the assessment
-- loader writes it. Every edition shares it, like the synopsis.
alter table public.works
  add column reading_notes text
    constraint works_reading_notes_tidy check (reading_notes is null or (reading_notes = btrim(reading_notes) and reading_notes <> ''));
