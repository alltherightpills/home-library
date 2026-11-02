-- Home Library: reading tracking. Adds one empty table; no existing book data changes.
--
-- One row per time a person reads a book, so a reread is a second row. Reading
-- is individual: each person sees and changes only their own rows, unlike the
-- books, which every member of the library shares.

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- The owned copy being read. Blank for a borrowed book, and for a copy
  -- removed from the library later (its title and author are copied here first).
  copy_id uuid,
  borrowed boolean not null default false,
  -- For a borrowed book (or a removed copy): what it was, and its ISBN, so
  -- scanning it again to finish finds this reading.
  title text,
  author text,
  isbn text,

  status text not null check (status in ('reading', 'finished', 'set_aside')),
  started_on date,
  -- Blank while reading, and for a past read whose date isn't known.
  ended_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (copy_id, library_id) references public.copies (id, library_id),
  check (copy_id is not null or title is not null),
  check (status <> 'reading' or ended_on is null)
);

create index readings_user on public.readings (user_id, library_id);
create index readings_copy on public.readings (copy_id);

create trigger readings_touch before update on public.readings
  for each row execute function public.touch_updated_at();

-- Removing a copy keeps everyone's reading history of it: the copy's title,
-- authors and ISBN move onto the readings, which then stop pointing at it.
-- "security definer" lets it reach other people's readings, which they can't.
create function public.keep_readings_of_removed_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.readings r
  set copy_id = null,
      title = coalesce(r.title, old.title),
      isbn = coalesce(r.isbn, old.isbn13, old.isbn10),
      author = coalesce(r.author, (
        select string_agg(a.display_name, ', ' order by wa.position)
        from public.work_authors wa
        join public.authors a on a.id = wa.author_id
        where wa.work_id = old.work_id
      ))
  where r.copy_id = old.id;
  return old;
end;
$$;

create trigger copies_keep_readings before delete on public.copies
  for each row execute function public.keep_readings_of_removed_copy();

alter table public.readings enable row level security;

create policy "people manage their own readings" on public.readings
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_library_member(library_id))
  with check (user_id = (select auth.uid()) and public.is_library_member(library_id));

revoke all on public.readings from anon;
grant select, insert, update, delete on public.readings to authenticated;
