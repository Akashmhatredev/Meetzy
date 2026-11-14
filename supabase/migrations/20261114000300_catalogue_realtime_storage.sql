-- =====================================================================
-- Activity catalogue, Realtime publication, avatar storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Activity catalogue. places_query is the Google Places Text Search query
-- the engine runs for that activity; icon is a lucide icon name.
-- ---------------------------------------------------------------------
insert into public.activities (slug, name, category, icon, places_query, sort_order) values
  ('cafe',            'Cafe',              'food',          'coffee',          'cafe',                   10),
  ('restaurant',      'Restaurant',        'food',          'utensils',        'restaurant',             20),
  ('street-food',     'Street food',       'food',          'soup',            'street food',            30),
  ('fine-dining',     'Fine dining',       'food',          'wine',            'fine dining restaurant', 40),
  ('dessert',         'Dessert',           'food',          'cake-slice',      'dessert shop',           50),
  ('ice-cream',       'Ice cream',         'food',          'ice-cream-cone',  'ice cream parlour',      60),
  ('movies',          'Movies',            'entertainment', 'clapperboard',    'movie theater',          110),
  ('bowling',         'Bowling',           'entertainment', 'target',          'bowling alley',          120),
  ('gaming',          'Gaming',            'entertainment', 'gamepad-2',       'gaming lounge',          130),
  ('go-karting',      'Go-karting',        'entertainment', 'flag',            'go karting track',       140),
  ('arcade',          'Arcade',            'entertainment', 'joystick',        'arcade',                 150),
  ('escape-room',     'Escape room',       'entertainment', 'key-round',       'escape room',            160),
  ('parks',           'Parks',             'outdoor',       'trees',           'park',                   210),
  ('adventure',       'Adventure',         'outdoor',       'mountain',        'adventure park',         220),
  ('sports',          'Sports',            'outdoor',       'trophy',          'sports complex',         230),
  ('trekking',        'Trekking',          'outdoor',       'footprints',      'trekking trail',         240),
  ('cycling',         'Cycling',           'outdoor',       'bike',            'cycling trail',          250),
  ('shopping-mall',   'Shopping mall',     'shopping',      'shopping-bag',    'shopping mall',          310),
  ('shopping-street', 'Shopping street',   'shopping',      'store',           'shopping street',        320),
  ('market',          'Market',            'shopping',      'shopping-basket', 'market',                 330)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Realtime: changes on these tables are pushed to subscribed members.
-- Supabase Realtime applies each table's RLS to every subscriber.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.groups,
      public.group_members,
      public.group_invitations,
      public.hangouts,
      public.hangout_locations,
      public.hangout_activities,
      public.activity_votes,
      public.calculation_runs,
      public.venues,
      public.venue_votes,
      public.notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Avatars: public-read bucket. Users write only "<uid>/..." and group
-- admins only "groups/<group id>/...". Images are resized client-side.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "avatars: users write own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: users update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: users delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: admins write group folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and private.is_group_admin(private.try_uuid((storage.foldername(name))[2]))
  );

create policy "avatars: admins update group folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and private.is_group_admin(private.try_uuid((storage.foldername(name))[2]))
  );

create policy "avatars: admins delete group folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and private.is_group_admin(private.try_uuid((storage.foldername(name))[2]))
  );

-- Storage needs SELECT on the row to delete or replace it (the public URL
-- serves reads without this policy).
create policy "avatars: users see own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'groups'
        and private.is_group_admin(private.try_uuid((storage.foldername(name))[2]))
      )
    )
  );
