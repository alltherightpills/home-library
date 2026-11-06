-- Home Library: a list of places books were acquired, with map coordinates
-- (Phase 2 step 3, slice C: the places map). Adds one empty table; no book data
-- changes, and the catalog doesn't read it, so the app works with or without it.
--
-- A place is matched to books by its text, exactly as on the copies
-- (acquired_city, acquired_region, acquired_country). Step 4's Manage › Places
-- takes this list over for renaming and merging.

create table public.places (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  city text,
  region text,
  country text,
  -- Blank when the lookup found nothing; the map lists those instead of guessing.
  latitude double precision,
  longitude double precision,
  -- 'lookup' = OpenStreetMap's place-name search; 'owner' = set by hand (step 4).
  -- The lookup never overwrites 'owner'.
  source text not null default 'lookup' check (source in ('lookup', 'owner')),
  found_as text, -- the name the lookup matched, to check it found the right town
  looked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  -- One row per place; a blank state or country counts as a value here.
  unique nulls not distinct (library_id, country, region, city)
);

create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

alter table public.places enable row level security;

create policy "members manage places" on public.places
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
