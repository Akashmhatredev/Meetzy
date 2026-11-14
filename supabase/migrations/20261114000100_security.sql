-- =====================================================================
-- Meetzy security: membership helpers, row level security, grants.
--
-- Model:
--   * Every table has RLS on. Default API grants are revoked and only
--     what the app needs is granted back, column by column for updates.
--   * Group-scoped rows are visible to members of that group only.
--   * Saved places (user_locations) are visible to their owner only.
--   * Multi-step writes go through SECURITY DEFINER RPCs that check
--     membership themselves (next migration).
--   * Engine output (calculation_runs, venues, venue_routes) is written
--     only by the service role from the compute-meetup Edge Function.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies on group_members can
-- call them without recursing into their own policy.
-- ---------------------------------------------------------------------
create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = p_group_id
       and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = p_group_id
       and m.user_id = (select auth.uid())
       and m.role = 'admin'
  );
$$;

create or replace function private.is_hangout_member(p_hangout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.hangouts h
      join public.group_members m on m.group_id = h.group_id
     where h.id = p_hangout_id
       and m.user_id = (select auth.uid())
  );
$$;

-- The hangout's creator (while still a member) or any group admin.
create or replace function private.can_manage_hangout(p_hangout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.hangouts h
      join public.group_members m on m.group_id = h.group_id
     where h.id = p_hangout_id
       and m.user_id = (select auth.uid())
       and (m.role = 'admin' or h.created_by = m.user_id)
  );
$$;

create or replace function private.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user_id
  );
$$;

-- Avatar paths look like "groups/<group uuid>/<file>"; a malformed uuid
-- must simply fail the check, not raise.
create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function
  private.is_group_member(uuid),
  private.is_group_admin(uuid),
  private.is_hangout_member(uuid),
  private.can_manage_hangout(uuid),
  private.shares_group_with(uuid),
  private.try_uuid(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.activities enable row level security;
alter table public.hangouts enable row level security;
alter table public.hangout_locations enable row level security;
alter table public.hangout_activities enable row level security;
alter table public.activity_votes enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.venues enable row level security;
alter table public.venue_routes enable row level security;
alter table public.venue_votes enable row level security;
alter table public.notifications enable row level security;
alter table private.rate_limits enable row level security;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------
-- profiles: yourself, plus people you share a group with.
create policy "profiles: read self and group mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_locations: owner only, for every operation.
create policy "user_locations: owner reads" on public.user_locations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_locations: owner inserts" on public.user_locations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_locations: owner updates" on public.user_locations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "user_locations: owner deletes" on public.user_locations
  for delete to authenticated using (user_id = (select auth.uid()));

-- groups
create policy "groups: members read" on public.groups
  for select to authenticated using (private.is_group_member(id));
create policy "groups: admins update" on public.groups
  for update to authenticated
  using (private.is_group_admin(id))
  with check (private.is_group_admin(id));
create policy "groups: admins delete" on public.groups
  for delete to authenticated using (private.is_group_admin(id));

-- group_members / invitations: read-only to members; writes go through RPCs.
create policy "group_members: members read" on public.group_members
  for select to authenticated using (private.is_group_member(group_id));
create policy "group_invitations: members read" on public.group_invitations
  for select to authenticated using (private.is_group_member(group_id));

-- activities: the shared catalogue, plus custom ones from your hangouts.
create policy "activities: catalogue and own hangouts" on public.activities
  for select to authenticated
  using (hangout_id is null or private.is_hangout_member(hangout_id));

-- hangouts
create policy "hangouts: members read" on public.hangouts
  for select to authenticated using (private.is_group_member(group_id));
create policy "hangouts: organisers update" on public.hangouts
  for update to authenticated
  using (private.can_manage_hangout(id))
  with check (private.can_manage_hangout(id));
create policy "hangouts: organisers delete" on public.hangouts
  for delete to authenticated using (private.can_manage_hangout(id));

-- Everything below is scoped to a hangout and readable by its members.
create policy "hangout_locations: members read" on public.hangout_locations
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "hangout_activities: members read" on public.hangout_activities
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "activity_votes: members read" on public.activity_votes
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "calculation_runs: members read" on public.calculation_runs
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "venues: members read" on public.venues
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "venue_routes: members read" on public.venue_routes
  for select to authenticated using (private.is_hangout_member(hangout_id));
create policy "venue_votes: members read" on public.venue_votes
  for select to authenticated using (private.is_hangout_member(hangout_id));

-- notifications: your own.
create policy "notifications: owner reads" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: owner marks read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notifications: owner deletes" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Grants. Supabase grants everything to anon/authenticated by default;
-- take it all back and grant the minimum.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

-- profiles: never expose email through the API (owners read it from the
-- auth session). Only these columns are selectable / updatable.
grant select (id, full_name, avatar_url, preferred_travel_mode, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, avatar_url, preferred_travel_mode) on public.profiles to authenticated;

grant select, delete on public.user_locations to authenticated;
grant insert (location_name, latitude, longitude, formatted_address, place_id, is_primary)
  on public.user_locations to authenticated;
grant update (location_name, latitude, longitude, formatted_address, place_id, is_primary)
  on public.user_locations to authenticated;

grant select, delete on public.groups to authenticated;
grant update (name, description, avatar_url, avatar_emoji, color) on public.groups to authenticated;

grant select on public.group_members to authenticated;
grant select on public.group_invitations to authenticated;
grant select on public.activities to authenticated;

grant select, delete on public.hangouts to authenticated;
grant update (title, notes, scheduled_for, optimization_strategy, travel_mode, activity_mode,
              max_travel_minutes, voting_deadline)
  on public.hangouts to authenticated;

grant select on public.hangout_locations to authenticated;
grant select on public.hangout_activities to authenticated;
grant select on public.activity_votes to authenticated;
grant select on public.calculation_runs to authenticated;
grant select on public.venues to authenticated;
grant select on public.venue_routes to authenticated;
grant select on public.venue_votes to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The Edge Functions use the service role, which bypasses RLS.
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- Guards for direct (non-RPC) updates.
-- ---------------------------------------------------------------------
create or replace function private.hangouts_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Direct API updates run as "authenticated"; RPCs run as the owner.
  if current_user = 'authenticated' then
    if old.status in ('finalized', 'cancelled') then
      raise exception using message = 'hangout_closed',
        detail = 'This hangout is closed. Reopen it before changing its settings.';
    end if;
    if new.voting_deadline is distinct from old.voting_deadline
       and new.voting_deadline is not null
       and new.voting_deadline <= now() then
      raise exception using message = 'invalid_deadline', detail = 'The voting deadline must be in the future.';
    end if;
  end if;

  if old.last_calculated_at is not null and (
       new.travel_mode is distinct from old.travel_mode
    or new.optimization_strategy is distinct from old.optimization_strategy
    or new.activity_mode is distinct from old.activity_mode
    or new.max_travel_minutes is distinct from old.max_travel_minutes
    or new.scheduled_for is distinct from old.scheduled_for
  ) and new.last_calculated_at is not distinct from old.last_calculated_at then
    new.inputs_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger hangouts_guard_update
  before update on public.hangouts
  for each row execute function private.hangouts_guard_update();
