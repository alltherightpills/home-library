-- Home Library: answers to Pick for me's judged questions (Phase 3, Pick for
-- me slice A). Adds one empty table and removes two empty, unused columns; no
-- book data changes when this is run, and the app doesn't read the table yet.
--
-- One row per book (work: every edition shares it) per question, so a
-- question can be added or changed later without another change like this
-- one. Which questions and answers exist is set in the app's code and in
-- assessment-guide.md, not here. A book with no row for a question hasn't
-- been answered, and Pick for me lets it through.
create table public.assessments (
  library_id uuid not null references public.libraries (id) on delete cascade,
  work_id uuid not null,
  -- 'international', 'driven', 'pace', 'mood', ...
  question text not null check (question ~ '^[a-z_]+$'),
  -- 'international', 'character', 'in_between', 'doesnt_apply', 'not_assessed', ...
  answer text not null check (answer ~ '^[a-z_]+$'),
  -- false: Claude didn't know the book well and its description didn't settle it.
  sure boolean not null default true,
  -- Whose answer it is. An assessment pass never overwrites the owner's.
  set_by text not null check (set_by in ('claude', 'owner')),
  -- Why, in a few words, when it was a close call.
  note text check (note is null or (note = btrim(note) and note <> '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (work_id, question),
  foreign key (work_id, library_id) references public.works (id, library_id) on delete cascade
);

create index assessments_library on public.assessments (library_id);

create trigger assessments_touch before update on public.assessments
  for each row execute function public.touch_updated_at();

-- The owner's answers are final: once a row is the owner's, nothing can hand
-- it back to Claude. (The owner can still change or clear their own answer.)
create function public.keep_owner_assessments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.set_by = 'owner' and new.set_by <> 'owner' then
    raise exception 'The owner''s answer to "%" can''t be replaced by Claude''s', old.question;
  end if;
  return new;
end;
$$;

create trigger assessments_keep_owner before update on public.assessments
  for each row execute function public.keep_owner_assessments();

alter table public.assessments enable row level security;

create policy "members manage assessments" on public.assessments
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.assessments from anon;
grant select, insert, update, delete on public.assessments to authenticated;

-- The original design's two answer columns, never filled (all 1,481 works were
-- blank on 2026-11-20) and never read by the app; the table above replaces them.
alter table public.works drop column origin, drop column driven_by;
