-- Home Library: renaming and merging places in Manage › Places (Phase 2 step 4,
-- slice D). Adds two functions; no data changes when this is run, and the
-- catalog doesn't call them, so the app works with or without them.
--
-- A book's place is the text in copies.acquired_city / _region / _country, as
-- typed (trimmed; blank counts as none). Places are matched by that text, so
-- renaming one place to another's exact text merges the two.

-- Removes saved map coordinates (places rows) that no book's place uses any
-- more, such as a misspelling since corrected. If a book uses that text again,
-- the map simply looks it up again. Returns how many were removed.
create function public.tidy_places()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with gone as (
    delete from public.places p
    where not exists (
      select 1 from public.copies c
      where c.library_id = p.library_id
        and nullif(trim(c.acquired_city), '') is not distinct from p.city
        and nullif(trim(c.acquired_region), '') is not distinct from p.region
        and nullif(trim(c.acquired_country), '') is not distinct from p.country
    )
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- Every book from the old place gets the new place's text, then unused map
-- coordinates are removed (the old spelling's, unless a book still uses it).
-- One step: a lost connection leaves everything as it was or everything renamed.
-- "security invoker": the library's own rules apply. Returns how many books changed.
create function public.rename_place(
  old_city text, old_region text, old_country text,
  new_city text, new_region text, new_country text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  old_city := nullif(trim(old_city), '');
  old_region := nullif(trim(old_region), '');
  old_country := nullif(trim(old_country), '');
  new_city := nullif(trim(new_city), '');
  new_region := nullif(trim(new_region), '');
  new_country := nullif(trim(new_country), '');
  if new_city is null and new_region is null then
    raise exception 'A place needs a city or a state.';
  end if;

  update public.copies c
  set acquired_city = new_city, acquired_region = new_region, acquired_country = new_country
  where nullif(trim(c.acquired_city), '') is not distinct from old_city
    and nullif(trim(c.acquired_region), '') is not distinct from old_region
    and nullif(trim(c.acquired_country), '') is not distinct from old_country;
  get diagnostics changed = row_count;

  -- A pin the owner chose (Search again) moves with the name, unless the new
  -- name has coordinates already. A looked-up one is left to tidy_places, so
  -- the new spelling is looked up fresh rather than keeping a wrong match.
  update public.places p
  set city = new_city, region = new_region, country = new_country
  where p.source = 'owner'
    and p.city is not distinct from old_city
    and p.region is not distinct from old_region
    and p.country is not distinct from old_country
    and not exists (
      select 1 from public.places q
      where q.library_id = p.library_id
        and q.city is not distinct from new_city
        and q.region is not distinct from new_region
        and q.country is not distinct from new_country
    );

  perform public.tidy_places();
  return changed;
end;
$$;

revoke execute on function public.tidy_places() from public, anon;
grant execute on function public.tidy_places() to authenticated;
revoke execute on function public.rename_place(text, text, text, text, text, text) from public, anon;
grant execute on function public.rename_place(text, text, text, text, text, text) to authenticated;
