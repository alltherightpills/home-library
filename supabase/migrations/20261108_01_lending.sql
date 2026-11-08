-- Home Library: lending books out (Phase 2 step 5, slice A). Adds two empty
-- tables and one function; no book data changes when this is run, and the
-- catalog doesn't read them, so the app's books load with or without them.
--
-- Lending is shared by the household, like the books (not individual, like
-- reading): every member sees what's lent out and to whom.

-- The people books are lent to. One row per person, so a rename later changes
-- every loan at once. Names are unique ignoring capitals: "sam" is "Sam".
create table public.borrowers (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  name text not null check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id)
);

create unique index borrowers_name on public.borrowers (library_id, lower(name));

-- One row each time a book goes out. Blank returned_on means it's still out.
-- Removing a book removes its loans; a borrower can't be removed while any
-- loan names them.
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  copy_id uuid not null,
  borrower_id uuid not null,
  lent_on date not null,
  returned_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (copy_id, library_id) references public.copies (id, library_id) on delete cascade,
  foreign key (borrower_id, library_id) references public.borrowers (id, library_id),
  check (returned_on is null or returned_on >= lent_on)
);

-- A book can be out to only one person at a time.
create unique index loans_one_out on public.loans (copy_id) where returned_on is null;
create index loans_borrower on public.loans (borrower_id);

create trigger borrowers_touch before update on public.borrowers
  for each row execute function public.touch_updated_at();
create trigger loans_touch before update on public.loans
  for each row execute function public.touch_updated_at();

alter table public.borrowers enable row level security;
alter table public.loans enable row level security;

create policy "members manage borrowers" on public.borrowers
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

create policy "members manage loans" on public.loans
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.borrowers from anon;
revoke all on public.loans from anon;
grant select, insert, update, delete on public.borrowers to authenticated;
grant select, insert, update, delete on public.loans to authenticated;

-- Lends a book to someone by name, dated `lent_on` (the phone's date: the
-- database's clock is UTC, already tomorrow on an Iowa evening). Someone not yet
-- on the list is added. Runs as one step, so a lost connection leaves neither
-- a new name with no loan nor a loan with no name. Spaces are tidied and
-- capitals ignored when matching, so "  sam " finds "Sam". Returns the loan.
-- "security invoker" (the default) means the library's own rules apply.
create function public.lend_copy(lend_copy_id uuid, borrower_name text, lent_on date)
returns public.loans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lib uuid;
  tidy text := regexp_replace(btrim(coalesce(borrower_name, '')), '\s+', ' ', 'g');
  person uuid;
  loan public.loans;
begin
  select library_id into lib from public.copies where id = lend_copy_id;
  if lib is null then
    raise exception 'That book isn''t in your library.';
  end if;
  if tidy = '' then
    raise exception 'Type who you''re lending it to.';
  end if;
  if exists (select 1 from public.loans where copy_id = lend_copy_id and returned_on is null) then
    raise exception 'This book is already lent out.';
  end if;

  select id into person from public.borrowers where library_id = lib and lower(name) = lower(tidy);
  if person is null then
    insert into public.borrowers (library_id, name) values (lib, tidy) returning id into person;
  end if;

  insert into public.loans (library_id, copy_id, borrower_id, lent_on)
  values (lib, lend_copy_id, person, lend_copy.lent_on)
  returning * into loan;
  return loan;
end;
$$;

revoke execute on function public.lend_copy(uuid, text, date) from public, anon;
grant execute on function public.lend_copy(uuid, text, date) to authenticated;
