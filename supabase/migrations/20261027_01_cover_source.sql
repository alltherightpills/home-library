-- Home Library: record where each copy's cover came from.

-- 'openlibrary_edition' (this ISBN's own cover), 'openlibrary_work' (a cover from any
-- edition of the work), later 'google' or 'hand'. Enrichment may replace any cover
-- except a 'hand' one.
alter table public.copies
  add column cover_source text;

-- Every cover so far came from the work record.
update public.copies set cover_source = 'openlibrary_work' where cover_id is not null;
