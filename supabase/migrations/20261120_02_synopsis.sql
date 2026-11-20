-- Home Library: a one-sentence synopsis for each book (Phase 3, Pick for me
-- slice B). Adds two empty columns to works; no book data changes when this is
-- run.
--
-- Shown on Pick for me's picks and the book page, and edited on Edit a Book.
-- Claude writes them during the assessment pass (slice D); until a book has
-- one, Pick for me leaves the line blank (owner's choice, 2026-11-20). Every
-- edition shares it, like the first-published year.
alter table public.works
  add column synopsis text check (synopsis is null or (synopsis = btrim(synopsis) and synopsis <> '')),
  -- Whose sentence it is: an assessment pass never replaces the owner's.
  add column synopsis_set_by text check (synopsis_set_by in ('claude', 'owner')),
  add check ((synopsis is null) = (synopsis_set_by is null));
