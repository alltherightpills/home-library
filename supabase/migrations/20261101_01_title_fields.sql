-- Home Library: fields for what the title cleanup moves out of titles. Adds empty
-- tables and blank columns only; no existing book data changes.

-- Series and publisher's series are shared lists that copies point to, so a
-- rename reaches every book. `aliases` holds other spellings of the same name.
create table public.series (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id),
  unique (library_id, name)
);

create table public.publisher_series (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id),
  unique (library_id, name)
);

-- One row per label on a book. The number is the one printed on this copy, kept
-- as text and per label: sets can number the same book differently.
create table public.copy_series (
  library_id uuid not null references public.libraries (id) on delete cascade,
  copy_id uuid not null,
  series_id uuid not null,
  number text,
  position int not null default 0, -- order shown in the app
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (copy_id, series_id),
  foreign key (copy_id, library_id) references public.copies (id, library_id) on delete cascade,
  foreign key (series_id, library_id) references public.series (id, library_id)
);

create table public.copy_publisher_series (
  library_id uuid not null references public.libraries (id) on delete cascade,
  copy_id uuid not null,
  publisher_series_id uuid not null,
  number text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (copy_id, publisher_series_id),
  foreign key (copy_id, library_id) references public.copies (id, library_id) on delete cascade,
  foreign key (publisher_series_id, library_id) references public.publisher_series (id, library_id)
);

create index copy_series_series on public.copy_series (series_id);
create index copy_publisher_series_series on public.copy_publisher_series (publisher_series_id);

-- original_title stays blank until the cleanup changes a title. Notes is general,
-- unlike review_note, which clears when the Needs checking flag is turned off.
alter table public.copies
  add column original_title text,
  add column edition_note text,
  add column notes text;

create trigger series_touch before update on public.series
  for each row execute function public.touch_updated_at();
create trigger publisher_series_touch before update on public.publisher_series
  for each row execute function public.touch_updated_at();
create trigger copy_series_touch before update on public.copy_series
  for each row execute function public.touch_updated_at();
create trigger copy_publisher_series_touch before update on public.copy_publisher_series
  for each row execute function public.touch_updated_at();

alter table public.series enable row level security;
alter table public.publisher_series enable row level security;
alter table public.copy_series enable row level security;
alter table public.copy_publisher_series enable row level security;

create policy "members manage series" on public.series
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage publisher_series" on public.publisher_series
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage copy_series" on public.copy_series
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage copy_publisher_series" on public.copy_publisher_series
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.series, public.publisher_series, public.copy_series, public.copy_publisher_series from anon;
grant select, insert, update, delete on public.series, public.publisher_series, public.copy_series, public.copy_publisher_series to authenticated;
