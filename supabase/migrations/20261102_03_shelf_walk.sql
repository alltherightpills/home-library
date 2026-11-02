-- Home Library: the shelf walk. Adds one blank column to copies, then tidies
-- the places already entered so the walk's place buttons start out consistent.

alter table public.copies
  -- The day this copy was checked on the shelf walk (year, place, read). Blank
  -- means not walked yet; a walked copy may still have no year or place.
  add column shelf_walked_on date;

-- Places are city, state, country, with the country always filled in.
-- US places entered before this had no country.
update public.copies
set acquired_country = 'USA'
where acquired_country is null
  and acquired_region in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
    'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY'
  );

-- A country typed in the state box (London, UK).
update public.copies
set acquired_region = null, acquired_country = 'UK'
where acquired_country is null and acquired_region = 'UK';
