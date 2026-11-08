-- Home Library: the wishlist (Phase 2 step 6, slice A). Adds one empty table;
-- no book data changes when this is run, and the catalog doesn't read it, so
-- the app's books load with or without it.
--
-- Books the household wants but doesn't own. Its own list, apart from the
-- library, so a wished-for book never counts in the totals. Shared by the
-- household, like lending (owner's choice, 2026-11-08). A wish means the book
-- in any edition: the ISBN is the edition that was scanned, and `work_key`
-- (Open Library's id for the book across its editions) lets Scan notice
-- another edition of it.
create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  title text not null check (title = btrim(title) and title <> ''),
  -- As the lookup gave them, for showing: {"Toni Morrison"}.
  authors text[] not null default '{}',
  isbn13 text check (isbn13 ~ '^97[89][0-9]{10}$'),
  work_key text,
  cover_url text,
  note text check (note is null or (note = btrim(note) and note <> '')),
  -- By the phone's date (the database's clock is UTC, already tomorrow on an
  -- Iowa evening).
  added_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same edition can't be wished for twice.
create unique index wishlist_isbn on public.wishlist (library_id, isbn13) where isbn13 is not null;

create trigger wishlist_touch before update on public.wishlist
  for each row execute function public.touch_updated_at();

alter table public.wishlist enable row level security;

create policy "members manage the wishlist" on public.wishlist
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.wishlist from anon;
grant select, insert, update, delete on public.wishlist to authenticated;
