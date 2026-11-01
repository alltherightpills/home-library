-- Home Library: what saving the vote's results needs. Adds blank columns only;
-- no existing book data changes.

-- A subcategory from the fallback, not one that reached the vote's threshold.
alter table public.book_categories
  add column tentative boolean not null default false;

-- What the review list shows: { flags: [...], suggestions: [{ sub, score }] }.
-- Blank when the book has nothing to review.
alter table public.copies
  add column category_review jsonb;
