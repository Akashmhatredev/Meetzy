/**
 * PGlite (PostgreSQL compiled to WASM) harness for the Supabase migrations.
 *
 * A small shim recreates what Supabase provides before the migrations run:
 * the anon / authenticated / service_role roles, auth.users + auth.uid(),
 * the storage schema used by the avatar policies, and the realtime
 * publication. Tests then switch role and JWT subject to act as a user,
 * so every row level security policy and grant is exercised for real.
 */
import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const SHIM = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;

  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's defaults: new public objects are fully granted to the API roles.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create publication supabase_realtime;
`

export async function createDb() {
  const db = new PGlite()
  await db.exec(SHIM)

  const dir = new URL('../../supabase/migrations/', import.meta.url).pathname
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8')
    try {
      await db.exec(sql)
    } catch (error) {
      error.message = `${file}: ${error.message}`
      throw error
    }
  }

  async function reset() {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', '', false)")
  }

  /** Run fn with the API role of a signed-in user (or anon when userId is null). */
  async function as(userId, fn) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ''])
    await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
    try {
      return await fn(db)
    } finally {
      await reset()
    }
  }

  async function asService(fn) {
    await db.exec('set role service_role')
    try {
      return await fn(db)
    } finally {
      await reset()
    }
  }

  /** Simulate a Supabase sign-up. Returns the new user id. */
  async function createUser(name, email = `${name.toLowerCase().replace(/\W+/g, '.')}@example.test`) {
    const id = randomUUID()
    await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
      id,
      email,
      JSON.stringify({ full_name: name }),
    ])
    return id
  }

  /** Call an RPC as a user and return the first row's first column (or the row). */
  async function rpc(userId, sql, params = []) {
    return as(userId, async () => (await db.query(sql, params)).rows)
  }

  return { db, as, asService, createUser, rpc, reset }
}
