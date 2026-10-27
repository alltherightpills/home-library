-- Home Library: let members look up their cover photos, which Supabase requires
-- (alongside delete) before a replaced photo's file can be removed.
create policy "members read cover photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers'
    and public.is_library_member(((storage.foldername(name))[1])::uuid));
