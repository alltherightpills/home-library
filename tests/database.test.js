// The database: every migration in supabase/migrations, run in order on a
// throwaway PostgreSQL (PGlite, which runs inside Node, so nothing touches the
// real Supabase), then checks of its rules acting as signed-in people.
//
// PGlite is plain PostgreSQL, so the few things Supabase adds are stood in for
// first: the sign-in schema (auth.users, auth.uid()), the photo storage schema,
// and the anon / authenticated roles with Supabase's default grants.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)

const SUPABASE_STAND_INS = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  -- Who's signed in: set by the test with set_config, as Supabase does from the sign-in token.
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;
`

// Two households, each with one person: Robin's books and Kit's.
const ROBIN = '00000000-0000-4000-8000-000000000001'
const KIT = '00000000-0000-4000-8000-000000000002'

let db

// Runs `fn` signed in as `user` (or signed out, with null), then goes back to
// the all-powerful setup role.
async function as(user, fn) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const rows = async (sql, params) => (await db.query(sql, params)).rows
const count = async (table) => Number((await one(`select count(*) as n from ${table}`)).n)

// A new book in the signed-in person's library; returns its id.
async function addBook(title) {
  const lib = (await one('select public.my_library() as id')).id
  const work = await one('insert into public.works (library_id, title) values ($1, $2) returning id', [lib, title])
  return (await one('insert into public.copies (library_id, work_id, title) values ($1, $2, $3) returning id', [lib, work.id, title])).id
}

const lend = (copyId, name, date = '2026-11-08') =>
  one('select * from public.lend_copy($1, $2, $3)', [copyId, name, date])

before(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STAND_INS)
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      await db.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'))
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${e.message}`)
    }
  }
  await db.query('insert into auth.users (id) values ($1), ($2)', [ROBIN, KIT])
})

after(() => db?.close())

describe('lending', () => {
  let odyssey, beowulf

  before(async () => {
    await as(ROBIN, async () => {
      odyssey = await addBook('The Odyssey')
      beowulf = await addBook('Beowulf')
    })
  })

  test('lending to a new name adds them and the loan in one step', async () => {
    await as(ROBIN, async () => {
      const loan = await lend(odyssey, '  Sam   Rivera ')
      assert.equal(loan.copy_id, odyssey)
      assert.equal(loan.returned_on, null)
      assert.equal(loan.lent_on.toISOString().slice(0, 10), '2026-11-08')
      assert.deepEqual(await rows('select name from public.borrowers'), [{ name: 'Sam Rivera' }])
    })
  })

  test('a book already out is refused', async () => {
    await as(ROBIN, async () => {
      await assert.rejects(lend(odyssey, 'Ana'), /already lent out/)
      // Nor can a second open loan be slipped in directly.
      const loan = await one('select library_id, borrower_id from public.loans where copy_id = $1', [odyssey])
      await assert.rejects(
        db.query('insert into public.loans (library_id, copy_id, borrower_id, lent_on) values ($1, $2, $3, $4)', [loan.library_id, odyssey, loan.borrower_id, '2026-11-09']),
        /loans_one_out/,
      )
      assert.equal(await count('public.borrowers'), 1, 'Ana was not added')
    })
  })

  test('the same name with other capitals and spaces is the same person', async () => {
    await as(ROBIN, async () => {
      await lend(beowulf, 'sam rivera')
      assert.equal(await count('public.borrowers'), 1)
      assert.equal(await count('public.loans'), 2)
    })
  })

  test('returned: not before it was lent; then it can go out again', async () => {
    await as(ROBIN, async () => {
      await assert.rejects(db.query(`update public.loans set returned_on = '2026-11-01' where copy_id = $1`, [odyssey]))
      await db.query(`update public.loans set returned_on = '2026-11-20' where copy_id = $1`, [odyssey])
      const again = await lend(odyssey, 'Ana', '2026-11-21')
      assert.equal(again.returned_on, null)
      assert.equal(await count('public.borrowers'), 2)
    })
  })

  test('all or nothing: a loan that fails leaves no new name behind', async () => {
    await as(ROBIN, async () => {
      const morte = await addBook('Le Morte d’Arthur')
      // A blank date fails at the loan, after the new name was added: both are undone.
      await assert.rejects(lend(morte, 'Jo', null))
      assert.equal(await count('public.borrowers'), 2)
      assert.equal(await count(`public.loans where copy_id = '${morte}'`), 0)
    })
  })

  test('a blank name is refused', async () => {
    await as(ROBIN, async () => {
      const book = await addBook('Gilgamesh')
      await assert.rejects(lend(book, '   '), /Type who/)
      await assert.rejects(db.query(`insert into public.borrowers (library_id, name) values (public.my_library(), ' Lee')`))
    })
  })

  test('another household sees none of it and can’t lend these books', async () => {
    await as(KIT, async () => {
      assert.equal(await count('public.loans'), 0)
      assert.equal(await count('public.borrowers'), 0)
      await assert.rejects(lend(beowulf, 'Kit’s friend'), /isn't in your library/)
    })
    await as(null, async () => {
      await assert.rejects(db.query('select * from public.loans'), /permission denied/)
      await assert.rejects(db.query('select * from public.borrowers'), /permission denied/)
      await assert.rejects(lend(beowulf, 'Anyone'), /permission denied/)
    })
  })

  test('a borrower with loans can’t be removed; removing a book removes its loans', async () => {
    await as(ROBIN, async () => {
      await assert.rejects(db.query(`delete from public.borrowers where name = 'Sam Rivera'`), /foreign key/)
      await db.query('delete from public.copies where id = $1', [beowulf])
      assert.equal(await count(`public.loans where copy_id = '${beowulf}'`), 0)
    })
  })
})
