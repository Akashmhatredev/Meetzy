-- =====================================================================
-- Meetzy schema: types, tables, indexes, integrity triggers.
-- Row level security, grants and RPCs live in the following migrations.
-- =====================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.travel_mode as enum ('DRIVE', 'TWO_WHEELER', 'WALK', 'BICYCLE', 'TRANSIT');
create type public.optimization_strategy as enum ('balanced', 'fair', 'fastest');
create type public.hangout_status as enum (
  'draft', 'waiting_for_locations', 'activity_selection', 'calculating',
  'venue_discovery', 'voting', 'finalized', 'cancelled'
);
create type public.group_role as enum ('admin', 'member');
create type public.location_source as enum ('saved', 'current', 'manual');
create type public.activity_mode as enum ('all_selected', 'most_popular');
create type public.calculation_status as enum ('running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: one row per auth user. Email is kept for the owner and for
-- support, but column grants hide it from other members (see security).
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  email text check (email is null or char_length(email) <= 320),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 600),
  preferred_travel_mode public.travel_mode not null default 'DRIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_avatar text;
begin
  v_name := coalesce(
    nullif(trim(v_meta ->> 'full_name'), ''),
    nullif(trim(v_meta ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );
  v_avatar := nullif(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'), '');
  if v_avatar is not null and v_avatar !~ '^https://' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, left(v_name, 80), left(v_avatar, 600))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------
-- user_locations: a user's saved places. Private to the owner, always.
-- Group members only ever see the per-hangout copy in hangout_locations.
-- ---------------------------------------------------------------------
create table public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  location_name text not null default 'Home'
    check (char_length(trim(location_name)) between 1 and 40),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  formatted_address text check (formatted_address is null or char_length(formatted_address) <= 300),
  place_id text check (place_id is null or char_length(place_id) <= 300),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_locations_user_idx on public.user_locations (user_id);
create unique index user_locations_one_primary on public.user_locations (user_id) where is_primary;

create trigger user_locations_touch before update on public.user_locations
  for each row execute function private.touch_updated_at();

-- Keep exactly one primary place, cap the number of saved places.
create or replace function private.user_locations_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.user_locations where user_id = new.user_id) >= 10 then
      raise exception using message = 'location_limit_reached',
        detail = 'You can save up to 10 places.';
    end if;
    if not exists (select 1 from public.user_locations where user_id = new.user_id and is_primary) then
      new.is_primary := true;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception using message = 'forbidden', detail = 'A saved place cannot change owner.';
  end if;

  if new.is_primary then
    update public.user_locations
       set is_primary = false
     where user_id = new.user_id and id <> new.id and is_primary;
  end if;
  return new;
end;
$$;

create trigger user_locations_before_write
  before insert or update on public.user_locations
  for each row execute function private.user_locations_before_write();

create or replace function private.user_locations_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_primary then
    update public.user_locations
       set is_primary = true
     where id = (
       select id from public.user_locations
        where user_id = old.user_id
        order by updated_at desc
        limit 1
     );
  end if;
  return old;
end;
$$;

create trigger user_locations_after_delete
  after delete on public.user_locations
  for each row execute function private.user_locations_after_delete();

-- ---------------------------------------------------------------------
-- groups and membership
-- ---------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 50),
  description text check (description is null or char_length(description) <= 280),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 600),
  avatar_emoji text not null default '👋' check (char_length(avatar_emoji) between 1 and 16),
  color text not null default 'mint'
    check (color in ('mint', 'lavender', 'sky', 'orange', 'rose', 'slate')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index groups_created_by_idx on public.groups (created_by);

create trigger groups_touch before update on public.groups
  for each row execute function private.touch_updated_at();

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  location_sharing_enabled boolean not null default false,
  location_sharing_updated_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now()
);

create index group_invitations_group_idx on public.group_invitations (group_id);
create index group_invitations_created_by_idx on public.group_invitations (created_by);

-- ---------------------------------------------------------------------
-- Activity catalogue (rows with hangout_id null) plus custom activities
-- that belong to one hangout.
-- ---------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 40),
  category text not null check (category in ('food', 'entertainment', 'outdoor', 'shopping', 'other')),
  icon text not null default 'sparkles' check (char_length(icon) <= 40),
  places_query text not null check (char_length(places_query) between 2 and 80),
  sort_order integer not null default 100,
  is_custom boolean not null default false,
  hangout_id uuid, -- FK added after hangouts exists
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((is_custom and hangout_id is not null and slug is null) or (not is_custom and hangout_id is null))
);

create index activities_hangout_idx on public.activities (hangout_id);
create index activities_created_by_idx on public.activities (created_by);

-- ---------------------------------------------------------------------
-- Hangouts
-- ---------------------------------------------------------------------
create table public.hangouts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  notes text check (notes is null or char_length(notes) <= 500),
  scheduled_for timestamptz,
  status public.hangout_status not null default 'waiting_for_locations',
  optimization_strategy public.optimization_strategy not null default 'fair',
  travel_mode public.travel_mode not null default 'DRIVE',
  activity_mode public.activity_mode not null default 'all_selected',
  max_travel_minutes integer check (max_travel_minutes is null or max_travel_minutes between 5 and 240),
  voting_deadline timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  selected_venue_id uuid,
  meeting_point_lat double precision check (meeting_point_lat is null or meeting_point_lat between -90 and 90),
  meeting_point_lng double precision check (meeting_point_lng is null or meeting_point_lng between -180 and 180),
  last_run_id uuid,
  last_calculated_at timestamptz,
  inputs_changed_at timestamptz,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hangouts_group_idx on public.hangouts (group_id, status);
create index hangouts_created_by_idx on public.hangouts (created_by);
create index hangouts_finalized_by_idx on public.hangouts (finalized_by);
create index hangouts_selected_venue_idx on public.hangouts (selected_venue_id);
create index hangouts_last_run_idx on public.hangouts (last_run_id);

create trigger hangouts_touch before update on public.hangouts
  for each row execute function private.touch_updated_at();

alter table public.activities
  add constraint activities_hangout_id_fkey
  foreign key (hangout_id) references public.hangouts (id) on delete cascade;

-- Each member's explicit, per-hangout location share.
create table public.hangout_locations (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  formatted_address text check (formatted_address is null or char_length(formatted_address) <= 300),
  label text check (label is null or char_length(label) <= 40),
  source public.location_source not null,
  -- Deleting the saved place withdraws every share made from it.
  source_location_id uuid references public.user_locations (id) on delete cascade,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hangout_id, user_id)
);

create index hangout_locations_user_idx on public.hangout_locations (user_id);
create index hangout_locations_source_idx on public.hangout_locations (source_location_id);

create trigger hangout_locations_touch before update on public.hangout_locations
  for each row execute function private.touch_updated_at();

create table public.hangout_activities (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (hangout_id, activity_id)
);

create index hangout_activities_activity_idx on public.hangout_activities (activity_id);
create index hangout_activities_created_by_idx on public.hangout_activities (created_by);

create table public.activity_votes (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null,
  activity_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (hangout_id, activity_id, user_id),
  foreign key (hangout_id, activity_id)
    references public.hangout_activities (hangout_id, activity_id) on delete cascade
);

create index activity_votes_user_idx on public.activity_votes (user_id);

-- ---------------------------------------------------------------------
-- Midpoint engine output. Written only by the compute-meetup Edge
-- Function (service role). Google content carries an expiry so it can be
-- purged to respect the Google Maps Platform caching terms.
-- ---------------------------------------------------------------------
create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status public.calculation_status not null default 'running',
  input_hash text not null check (char_length(input_hash) <= 128),
  strategy public.optimization_strategy not null,
  travel_mode public.travel_mode not null,
  previous_status public.hangout_status,
  participant_count integer not null default 0,
  center_lat double precision,
  center_lng double precision,
  area_lat double precision,
  area_lng double precision,
  area_kind text,
  area_metrics jsonb,
  activities_used jsonb,
  venues_considered integer,
  routes_requested integer,
  routes_failed integer,
  warnings jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  content_expires_at timestamptz
);

create index calculation_runs_hangout_idx on public.calculation_runs (hangout_id, started_at desc);
create index calculation_runs_requested_by_idx on public.calculation_runs (requested_by);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  run_id uuid references public.calculation_runs (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  google_place_id text not null check (char_length(google_place_id) <= 300),
  name text,
  address text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  rating numeric(2, 1) check (rating is null or rating between 0 and 5),
  rating_count integer check (rating_count is null or rating_count >= 0),
  price_level text,
  primary_type text,
  primary_type_label text,
  google_maps_uri text,
  photo_uri text,
  photo_attributions jsonb,
  opening_hours jsonb,
  open_now boolean,
  business_status text,
  distance_from_area_m integer,
  rank integer,
  avg_travel_seconds integer,
  max_travel_seconds integer,
  min_travel_seconds integer,
  total_travel_seconds integer,
  spread_seconds integer,
  reachable_count integer,
  participant_count integer,
  routes_complete boolean not null default false,
  within_limit boolean,
  explanation text,
  content_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hangout_id, google_place_id)
);

create index venues_hangout_rank_idx on public.venues (hangout_id, rank);
create index venues_run_idx on public.venues (run_id);
create index venues_activity_idx on public.venues (activity_id);
create index venues_expiry_idx on public.venues (content_expires_at);

create trigger venues_touch before update on public.venues
  for each row execute function private.touch_updated_at();

alter table public.hangouts
  add constraint hangouts_selected_venue_id_fkey
  foreign key (selected_venue_id) references public.venues (id) on delete set null;

alter table public.hangouts
  add constraint hangouts_last_run_id_fkey
  foreign key (last_run_id) references public.calculation_runs (id) on delete set null;

create table public.venue_routes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  travel_mode public.travel_mode not null,
  travel_time_seconds integer check (travel_time_seconds is null or travel_time_seconds >= 0),
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  condition text not null default 'ROUTE_EXISTS',
  polyline text,
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);

create index venue_routes_hangout_idx on public.venue_routes (hangout_id);
create index venue_routes_user_idx on public.venue_routes (user_id);

create table public.venue_votes (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hangout_id, user_id)
);

create index venue_votes_venue_idx on public.venue_votes (venue_id);
create index venue_votes_user_idx on public.venue_votes (user_id);

-- ---------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) <= 40),
  title text not null check (char_length(title) <= 140),
  body text check (body is null or char_length(body) <= 280),
  group_id uuid references public.groups (id) on delete cascade,
  hangout_id uuid references public.hangouts (id) on delete cascade,
  link text check (link is null or (link ~ '^/' and char_length(link) <= 200)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_group_idx on public.notifications (group_id);
create index notifications_hangout_idx on public.notifications (hangout_id);

-- ---------------------------------------------------------------------
-- Rate limiting (private, never exposed through the API)
-- ---------------------------------------------------------------------
create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  primary key (user_id, action)
);
