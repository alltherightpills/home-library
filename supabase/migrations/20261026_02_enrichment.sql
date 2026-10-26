-- Home Library: storage for book-data lookups (Open Library, Library of Congress).

-- Every answer from an outside source, kept so each book is looked up only once.
-- `found = false` records a search that came back empty, so it isn't repeated.
create table public.lookups (
  library_id uuid not null references public.libraries (id) on delete cascade,
  source text not null,  -- 'openlibrary' or 'loc'
  isbn text not null,    -- the ISBN that was looked up
  found boolean not null,
  data jsonb,            -- the source's answer
  fetched_at timestamptz not null default now(),
  primary key (library_id, source, isbn)
);

-- New blanks filled in by enrichment (only where empty; hand edits always win).
alter table public.works
  add column first_published_source text; -- where first_published_year came from

alter table public.copies
  add column cover_id bigint,                         -- Open Library cover image number
  add column lc_call_number text,                     -- LC's 050, when LC has a record
  add column lc_subjects jsonb not null default '[]'; -- LC 6XX fields with subfields

alter table public.lookups enable row level security;

create policy "members manage lookups" on public.lookups
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.lookups from anon;
grant select, insert, update, delete on public.lookups to authenticated;
