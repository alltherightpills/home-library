-- Home Library: covers chosen in the app (cover picker).

-- The web address of a cover that isn't an Open Library cover number: a Google
-- Books image or a photo of the copy. When set, it is shown instead of cover_id.
-- New cover_source values: 'picked_openlibrary', 'picked_google', 'photo'.
-- Enrichment only ever replaces covers whose source starts with 'openlibrary_'.
alter table public.copies
  add column cover_url text;

-- Photos of copies, stored as covers/<library id>/<file>.jpg. Anyone with a photo's
-- address can view it (like the Open Library covers); only members can add or remove.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 2097152, array['image/jpeg']);

create policy "members add cover photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers'
    and public.is_library_member(((storage.foldername(name))[1])::uuid));

create policy "members remove cover photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers'
    and public.is_library_member(((storage.foldername(name))[1])::uuid));
