-- Home Library: borrowed books on the Reading tab. Adds two blank columns to
-- readings; nothing else changes.

alter table public.readings
  -- A borrowed book's cover link (an owned copy's cover comes from the copy).
  add column cover_url text,
  -- Who lent it: "Decorah Public Library", a friend's name. Optional.
  add column borrowed_from text;
