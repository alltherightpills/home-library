-- Home Library: where each copy is kept, Home or Office. Not a shelf or room
-- (those were ruled out: books move too often), just which building.
-- Every book already in the catalog is at home, so the default fills them in.

alter table public.copies
  add column location text not null default 'Home'
    constraint copies_location_known check (location in ('Home', 'Office'));
