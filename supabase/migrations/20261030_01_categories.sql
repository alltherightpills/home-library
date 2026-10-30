-- Home Library: the shelves. Adds the category list, which books are on which
-- shelf, and each book's audience. Adds empty tables and blank columns only;
-- no existing book data changes.

-- The fixed list: a main category has no parent; a subcategory points at its
-- main category. Other tables point at the id, so a rename can't split a category.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  name text not null,
  parent_id uuid,
  position int not null default 0, -- order shown in the app
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, library_id),
  unique nulls not distinct (library_id, parent_id, name),
  foreign key (parent_id, library_id) references public.categories (id, library_id)
);

alter table public.copies add constraint copies_id_library unique (id, library_id);

-- One row per shelf a book is on. `is_main` marks the one main shelf, which
-- reports count; other main categories on a book are its "also in" shelves.
-- `set_by` says whose choice it is: the vote never overwrites 'owner'.
-- `removed` remembers a book the owner took off a shelf, so the vote can't put it back.
create table public.book_categories (
  library_id uuid not null references public.libraries (id) on delete cascade,
  copy_id uuid not null,
  category_id uuid not null,
  is_main boolean not null default false,
  set_by text not null check (set_by in ('vote', 'owner')),
  removed boolean not null default false,
  reasons jsonb not null default '[]', -- the votes behind it, for "why is this here?"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (copy_id, category_id),
  foreign key (copy_id, library_id) references public.copies (id, library_id) on delete cascade,
  foreign key (category_id, library_id) references public.categories (id, library_id),
  check (not (is_main and removed))
);

-- At most one main shelf per book.
create unique index book_categories_one_main on public.book_categories (copy_id) where is_main;
create index book_categories_category on public.book_categories (category_id);
create index categories_parent on public.categories (parent_id);

-- A main shelf must be a main category, not a subcategory.
create function public.check_main_shelf()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_main and exists (
    select 1 from public.categories where id = new.category_id and parent_id is not null
  ) then
    raise exception 'A main shelf must be a main category, not a subcategory';
  end if;
  return new;
end;
$$;

create trigger book_categories_main_shelf before insert or update on public.book_categories
  for each row execute function public.check_main_shelf();

create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger book_categories_touch before update on public.book_categories
  for each row execute function public.touch_updated_at();

-- Audience belongs to the book, not a shelf. Blank until the vote or the owner sets it.
alter table public.copies
  add column audience text check (audience in ('Adult', 'Teen', 'Kids')),
  add column audience_set_by text check (audience_set_by in ('vote', 'owner'));

alter table public.categories enable row level security;
alter table public.book_categories enable row level security;

create policy "members manage categories" on public.categories
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));
create policy "members manage book_categories" on public.book_categories
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

revoke all on public.categories, public.book_categories from anon;
grant select, insert, update, delete on public.categories, public.book_categories to authenticated;
