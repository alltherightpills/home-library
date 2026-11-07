-- Home Library: merging two people in Manage › Authors (Phase 2 step 4, slice C).
-- Adds one function and one small table; no book data changes when this is run,
-- and the catalog doesn't read either, so the app works with or without them.

-- Merges people into the one to keep: every book crediting them credits the kept
-- person instead, and they're removed. A book that credits both in the same role
-- ends up with one credit, at the earlier of the two positions. Runs as one
-- step, so a lost connection leaves everything as it was or everything merged.
-- "security invoker" (the default) means the library's own rules apply: members
-- can merge only people in their own library.
create function public.merge_authors(keep_id uuid, drop_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lib uuid;
  drop_id uuid;
begin
  select library_id into lib from public.authors where id = keep_id;
  if lib is null then
    raise exception 'The person to keep isn''t in your library.';
  end if;
  if keep_id = any (drop_ids) then
    raise exception 'A person can''t be merged into themselves.';
  end if;
  if (select count(*) from public.authors where id = any (drop_ids) and library_id = lib)
     <> cardinality(array(select distinct unnest(drop_ids))) then
    raise exception 'Someone to merge isn''t in your library.';
  end if;

  -- One at a time, so two merged people on the same book become one credit too.
  foreach drop_id in array drop_ids loop
    update public.work_authors k
    set position = least(k.position, d.position)
    from public.work_authors d
    where k.author_id = keep_id and d.author_id = drop_id
      and d.work_id = k.work_id and d.role = k.role;

    delete from public.work_authors d
    using public.work_authors k
    where d.author_id = drop_id and k.author_id = keep_id
      and d.work_id = k.work_id and d.role = k.role;

    update public.work_authors set author_id = keep_id where author_id = drop_id;
    delete from public.authors where id = drop_id;
  end loop;
end;
$$;

revoke execute on function public.merge_authors(uuid, uuid[]) from public, anon;
grant execute on function public.merge_authors(uuid, uuid[]) to authenticated;

-- Pairs of people the owner checked and said are different (Mitchell, David and
-- Mitchell, David T.), so Possible duplicates doesn't show them again. Stored
-- with the smaller id first, so each pair has one row. Removing either person
-- removes the pair.
create table public.authors_not_same (
  library_id uuid not null references public.libraries (id) on delete cascade,
  author_a uuid not null,
  author_b uuid not null,
  created_at timestamptz not null default now(),
  primary key (author_a, author_b),
  check (author_a < author_b),
  foreign key (author_a, library_id) references public.authors (id, library_id) on delete cascade,
  foreign key (author_b, library_id) references public.authors (id, library_id) on delete cascade
);

alter table public.authors_not_same enable row level security;

create policy "members manage checked pairs" on public.authors_not_same
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.authors_not_same from anon;
grant select, insert, delete on public.authors_not_same to authenticated;
