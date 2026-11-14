/** Structural security checks over the whole schema, so new objects can't slip through. */
import { assert, su } from './helpers.mjs'

const SERVICE_ONLY = [
  'start_calculation',
  'complete_calculation',
  'fail_calculation',
  'purge_expired_google_content',
]

export const tests = [
  {
    name: 'row level security is on for every table in public and private',
    async fn(h) {
      const rows = await su(
        h,
        `select n.nspname || '.' || c.relname as name
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity`,
      )
      assert.deepEqual(rows, [])
    },
  },
  {
    name: 'anon has no table privileges and only the invitation preview RPC',
    async fn(h) {
      const tables = await su(
        h,
        `select table_name, privilege_type from information_schema.role_table_grants
          where grantee = 'anon' and table_schema in ('public', 'private')`,
      )
      assert.deepEqual(tables, [])
      const functions = await su(
        h,
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
          order by 1`,
      )
      assert.deepEqual(
        functions.map((f) => f.proname),
        ['get_invitation_preview'],
      )
    },
  },
  {
    name: 'engine functions are executable by the service role only',
    async fn(h) {
      for (const name of SERVICE_ONLY) {
        const [row] = await su(
          h,
          `select has_function_privilege('authenticated', p.oid, 'execute') as auth,
                  has_function_privilege('service_role', p.oid, 'execute') as service
             from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
          [name],
        )
        assert.deepEqual(row, { auth: false, service: true }, name)
      }
    },
  },
  {
    name: 'authenticated can execute only the intended private helpers',
    async fn(h) {
      const rows = await su(
        h,
        `select p.proname from pg_proc p
          where p.pronamespace = 'private'::regnamespace
            and has_function_privilege('authenticated', p.oid, 'execute')
          order by 1`,
      )
      assert.deepEqual(
        rows.map((r) => r.proname),
        ['can_manage_hangout', 'is_group_admin', 'is_group_member', 'is_hangout_member', 'shares_group_with', 'try_uuid'],
      )
    },
  },
  {
    name: 'every SECURITY DEFINER function pins an empty search_path',
    async fn(h) {
      const rows = await su(
        h,
        `select n.nspname || '.' || p.proname as name
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'private') and p.prosecdef
            and not coalesce('search_path=""' = any (p.proconfig), false)`,
      )
      assert.deepEqual(rows, [])
      const [{ count }] = await su(
        h,
        `select count(*)::int as count from pg_proc p
          where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef`,
      )
      assert.ok(count > 25, `expected the RPCs to be SECURITY DEFINER, found ${count}`)
    },
  },
  {
    name: 'authenticated can insert rows directly only into saved places',
    async fn(h) {
      const rows = await su(
        h,
        `select distinct table_name from information_schema.role_column_grants
          where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'INSERT'
         union
         select distinct table_name from information_schema.role_table_grants
          where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'INSERT'`,
      )
      assert.deepEqual(
        rows.map((r) => r.table_name),
        ['user_locations'],
      )
    },
  },
  {
    name: 'realtime publishes the collaborative tables',
    async fn(h) {
      const rows = await su(
        h,
        "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
      )
      assert.deepEqual(
        rows.map((r) => r.tablename),
        [
          'activity_votes',
          'calculation_runs',
          'group_invitations',
          'group_members',
          'groups',
          'hangout_activities',
          'hangout_locations',
          'hangouts',
          'notifications',
          'venue_votes',
          'venues',
        ],
      )
    },
  },
  {
    name: 'the avatars bucket is public, small and image-only',
    async fn(h) {
      const [bucket] = await su(h, "select * from storage.buckets where id = 'avatars'")
      assert.equal(bucket.public, true)
      assert.equal(Number(bucket.file_size_limit), 1048576)
      assert.deepEqual(bucket.allowed_mime_types, ['image/webp', 'image/png', 'image/jpeg'])
    },
  },
]
