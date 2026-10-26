-- Home Library: first database setup.
--
-- Everything belongs to a *library* (a household), not to a single person.
-- People are given access to a library through library_members, and every
-- table has a rule: you can only see or change rows of libraries you belong to.

-- ---------------------------------------------------------------------------
-- Libraries and who belongs to them
-- ---------------------------------------------------------------------------

create table public.libraries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.library_members (
  library_id uuid not null references public.libraries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

-- True if the signed-in person belongs to the given library. Used by every rule
-- below. "security definer" lets it read library_members without that table's
-- own rule getting in the way (which would otherwise loop forever).
create function public.is_library_member(lib uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members
    where library_id = lib and user_id = (select auth.uid())
  );
$$;

-- Returns the signed-in person's library, creating "Home Library" with them as
-- its first member if they don't have one yet. This is the only way to create
-- a library, so nobody can add themselves to someone else's.
create function public.my_library()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lib uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select library_id into lib
  from public.library_members
  where user_id = auth.uid()
  order by joined_at
  limit 1;

  if lib is null then
    insert into public.libraries (name) values ('Home Library') returning id into lib;
    insert into public.library_members (library_id, user_id) values (lib, auth.uid());
  end if;

  return lib;
end;
$$;

-- ---------------------------------------------------------------------------
-- Works, copies, and authors
-- ---------------------------------------------------------------------------

-- A work is the book in the abstract (The Odyssey); copies are physical books.
create table public.works (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  title text not null,
  first_published_year int,
  original_language text,
  -- Recommender attributes, filled in later.
  origin text check (origin in ('international', 'domestic')),
  driven_by text check (driven_by in ('character', 'plot')),
  lt_workcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id),
  unique (library_id, lt_workcode)
);

-- One row per person, so an author counts once however many books they wrote.
create table public.authors (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  sort_name text not null,    -- "Austen, Jane"
  display_name text not null, -- "Jane Austen"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id),
  unique (library_id, sort_name)
);

-- Who contributed to which work, and how (Author, Translator, Illustrator...).
create table public.work_authors (
  library_id uuid not null references public.libraries (id) on delete cascade,
  work_id uuid not null,
  author_id uuid not null,
  role text not null default 'Author',
  position int not null default 0, -- order shown on the book page
  primary key (work_id, author_id, role),
  -- The work and author must belong to the same library as this row.
  foreign key (work_id, library_id) references public.works (id, library_id) on delete cascade,
  foreign key (author_id, library_id) references public.authors (id, library_id) on delete cascade
);

-- Each physical book. This is what the "books" total counts.
create table public.copies (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  work_id uuid not null,

  -- This edition
  title text not null,
  isbn13 text,
  isbn10 text,
  publisher text,
  edition_year int,
  pages int,
  binding text, -- Paperback, Hardcover...
  languages text[] not null default '{}',

  -- Raw ingredients for categorizing
  lcc text,                                -- LC call number
  dewey text,
  dewey_wording text[] not null default '{}',
  subjects jsonb not null default '[]',    -- [["Tales", "Japan"], ...]
  lt_genres text[] not null default '{}',

  -- From the bookplate (backfilled in the app)
  acquired_year int,
  acquired_city text,
  acquired_region text,
  acquired_country text,

  -- Records that need a person to look at them, and why
  needs_review boolean not null default false,
  review_note text,

  -- The original LibraryThing record, kept untouched for reference
  lt_book_id text,
  lt_record jsonb,

  added_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (work_id, library_id) references public.works (id, library_id),
  unique (library_id, lt_book_id)
);

create index copies_isbn13 on public.copies (library_id, isbn13);
create index copies_work on public.copies (work_id);
create index work_authors_author on public.work_authors (author_id);

-- Keep updated_at current whenever a row changes.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger works_touch before update on public.works
  for each row execute function public.touch_updated_at();
create trigger authors_touch before update on public.authors
  for each row execute function public.touch_updated_at();
create trigger copies_touch before update on public.copies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Per-library rules (row-level security)
-- ---------------------------------------------------------------------------

alter table public.libraries enable row level security;
alter table public.library_members enable row level security;
alter table public.works enable row level security;
alter table public.authors enable row level security;
alter table public.work_authors enable row level security;
alter table public.copies enable row level security;

-- Members can see and rename their library. Creating one goes through my_library().
create policy "members read library" on public.libraries
  for select to authenticated using (public.is_library_member(id));
create policy "members rename library" on public.libraries
  for update to authenticated using (public.is_library_member(id));

-- Members can see who else is in their library. Adding members is done by hand for now.
create policy "members read members" on public.library_members
  for select to authenticated using (public.is_library_member(library_id));

-- Members can do everything with their library's books.
create policy "members manage works" on public.works
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage authors" on public.authors
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage work_authors" on public.work_authors
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage copies" on public.copies
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

-- Signed-out visitors get nothing at all; signed-in people go through the rules above.
revoke all on public.libraries, public.library_members, public.works,
  public.authors, public.work_authors, public.copies from anon;
grant select, update on public.libraries to authenticated;
grant select on public.library_members to authenticated;
grant select, insert, update, delete on public.works, public.authors,
  public.work_authors, public.copies to authenticated;

revoke execute on function public.my_library() from public, anon;
grant execute on function public.my_library() to authenticated;
revoke execute on function public.is_library_member(uuid) from public, anon;
grant execute on function public.is_library_member(uuid) to authenticated;
