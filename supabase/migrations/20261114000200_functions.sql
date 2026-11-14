-- =====================================================================
-- Meetzy RPCs and behavioural triggers.
--
-- Every public function is SECURITY DEFINER with an empty search_path,
-- checks auth.uid() and membership itself, and raises errors whose
-- MESSAGE is a stable code the client maps to friendly copy
-- (src/utils/errors.js). DETAIL carries a human sentence.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using message = 'not_authenticated', detail = 'Please sign in again.', errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Fixed-window rate limiter. The increment only commits when the caller's
-- transaction commits, so only call this from code paths that succeed or
-- that return (rather than raise) on expected failures.
create or replace function private.check_rate_limit(
  p_action text,
  p_max integer,
  p_window interval,
  p_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_row private.rate_limits;
begin
  if v_user is null then
    return;
  end if;

  insert into private.rate_limits as r (user_id, action, window_start, hits)
  values (v_user, p_action, now(), 1)
  on conflict (user_id, action) do update
    set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning * into v_row;

  if v_row.hits > p_max then
    raise exception using
      message = 'rate_limited',
      detail = format('Too many attempts. Try again in about %s minute(s).',
                      greatest(1, ceil(extract(epoch from (v_row.window_start + p_window - now())) / 60)::int));
  end if;
end;
$$;

create or replace function private.random_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 symbols: no I, O, 0 or 1, so codes survive being read aloud.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_positions constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10]; -- skip version/variant bytes
  v_code text := '';
  v_i int;
begin
  foreach v_i in array v_positions loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function private.notify(
  p_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text,
  p_group_id uuid,
  p_hangout_id uuid,
  p_link text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, group_id, hangout_id, link)
  select distinct u, p_type, left(p_title, 140), left(p_body, 280), p_group_id, p_hangout_id, p_link
    from unnest(p_user_ids) as u
   where u is not null;
$$;

create or replace function private.group_member_ids(p_group_id uuid, p_except uuid default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(user_id), '{}')
    from public.group_members
   where group_id = p_group_id
     and (p_except is null or user_id <> p_except);
$$;

create or replace function private.hangout_is_open(p_status public.hangout_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status not in ('finalized', 'cancelled');
$$;

-- Load a hangout the caller belongs to, or raise.
create or replace function private.member_hangout(p_hangout_id uuid, p_lock boolean default false)
returns public.hangouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hangouts;
begin
  if p_lock then
    select * into v_row from public.hangouts where id = p_hangout_id for update;
  else
    select * into v_row from public.hangouts where id = p_hangout_id;
  end if;

  if not found or not private.is_group_member(v_row.group_id) then
    raise exception using message = 'not_found', detail = 'That hangout does not exist or you are not a member.';
  end if;
  return v_row;
end;
$$;

create or replace function private.mark_inputs_changed(p_hangout_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.hangouts
     set inputs_changed_at = now()
   where id = p_hangout_id
     and last_calculated_at is not null
     and status not in ('finalized', 'cancelled');
$$;

-- ---------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------
create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_emoji text default '👋',
  p_color text default 'mint'
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_group public.groups;
begin
  if (select count(*) from public.group_members where user_id = v_uid) >= 50 then
    raise exception using message = 'group_limit_reached', detail = 'You can be in up to 50 groups.';
  end if;
  perform private.check_rate_limit('create_group', 20, interval '1 hour');

  insert into public.groups (name, description, avatar_emoji, color, created_by)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(nullif(trim(coalesce(p_emoji, '')), ''), '👋'),
    coalesce(p_color, 'mint'),
    v_uid
  )
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'admin');

  return v_group;
end;
$$;

create or replace function public.create_group_invitation(
  p_group_id uuid,
  p_expires_in_hours integer default 168,
  p_max_uses integer default null
)
returns public.group_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_invite public.group_invitations;
  v_attempt int := 0;
begin
  if not private.is_group_member(p_group_id) then
    raise exception using message = 'not_found', detail = 'That group does not exist or you are not a member.';
  end if;
  if p_expires_in_hours is not null and (p_expires_in_hours < 1 or p_expires_in_hours > 24 * 90) then
    raise exception using message = 'invalid_input', detail = 'Invitations can last between 1 hour and 90 days.';
  end if;
  perform private.check_rate_limit('create_invitation', 30, interval '1 hour');

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.group_invitations (group_id, invite_code, created_by, expires_at, max_uses)
      values (
        p_group_id,
        private.random_invite_code(),
        v_uid,
        case when p_expires_in_hours is null then null else now() + make_interval(hours => p_expires_in_hours) end,
        p_max_uses
      )
      returning * into v_invite;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  return v_invite;
end;
$$;

create or replace function public.revoke_group_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_invite public.group_invitations;
begin
  select * into v_invite from public.group_invitations where id = p_invitation_id;
  if not found or not private.is_group_member(v_invite.group_id) then
    raise exception using message = 'not_found', detail = 'Invitation not found.';
  end if;
  if not (private.is_group_admin(v_invite.group_id) or v_invite.created_by = v_uid) then
    raise exception using message = 'forbidden', detail = 'Only group admins can revoke other people''s invitations.';
  end if;
  update public.group_invitations set revoked_at = coalesce(revoked_at, now()) where id = p_invitation_id;
end;
$$;

create or replace function private.invitation_status(p_invite public.group_invitations)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_invite.id is null then 'not_found'
    when p_invite.revoked_at is not null then 'revoked'
    when p_invite.expires_at is not null and p_invite.expires_at <= now() then 'expired'
    when p_invite.max_uses is not null and p_invite.use_count >= p_invite.max_uses then 'exhausted'
    else 'valid'
  end;
$$;

-- Public preview for the /join/:code page. Reveals only the group's name,
-- look, size and the inviter's first name.
create or replace function public.get_invitation_preview(p_code text)
returns table (
  status text,
  group_id uuid,
  group_name text,
  group_emoji text,
  group_color text,
  group_avatar_url text,
  member_count integer,
  inviter_name text,
  expires_at timestamptz,
  already_member boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invitations;
  v_status text;
begin
  select * into v_invite from public.group_invitations where invite_code = upper(trim(coalesce(p_code, '')));
  v_status := private.invitation_status(v_invite);
  if v_status = 'not_found' then
    return query select v_status, null::uuid, null::text, null::text, null::text, null::text, null::int,
                        null::text, null::timestamptz, false;
    return;
  end if;

  return query
  select v_status,
         case when v_status = 'valid' or private.is_group_member(g.id) then g.id end,
         g.name,
         g.avatar_emoji,
         g.color,
         g.avatar_url,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''),
         v_invite.expires_at,
         coalesce(private.is_group_member(g.id), false)
    from public.groups g
    left join public.profiles p on p.id = v_invite.created_by
   where g.id = v_invite.group_id;
end;
$$;

-- Returns a status instead of raising on bad codes so failed attempts
-- still count against the rate limit.
create or replace function public.join_group_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_invite public.group_invitations;
  v_status text;
  v_name text;
begin
  perform private.check_rate_limit('join_group', 10, interval '10 minutes');

  select * into v_invite
    from public.group_invitations
   where invite_code = upper(trim(coalesce(p_code, '')))
   for update;
  v_status := private.invitation_status(v_invite);

  if v_status <> 'valid' then
    if v_status <> 'not_found' and exists (
      select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid
    ) then
      return jsonb_build_object('status', 'already_member', 'group_id', v_invite.group_id);
    end if;
    return jsonb_build_object('status', v_status);
  end if;

  if exists (select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid) then
    return jsonb_build_object('status', 'already_member', 'group_id', v_invite.group_id);
  end if;
  if (select count(*) from public.group_members where group_id = v_invite.group_id) >= 50 then
    return jsonb_build_object('status', 'group_full');
  end if;
  if (select count(*) from public.group_members where user_id = v_uid) >= 50 then
    return jsonb_build_object('status', 'group_limit_reached');
  end if;

  insert into public.group_members (group_id, user_id, role) values (v_invite.group_id, v_uid, 'member');
  update public.group_invitations set use_count = use_count + 1 where id = v_invite.id;

  select coalesce(nullif(full_name, ''), 'Someone') into v_name from public.profiles where id = v_uid;
  perform private.notify(
    array(select user_id from public.group_members
           where group_id = v_invite.group_id and role = 'admin' and user_id <> v_uid),
    'member_joined',
    format('%s joined %s', v_name, (select name from public.groups where id = v_invite.group_id)),
    null, v_invite.group_id, null,
    format('/groups/%s/members', v_invite.group_id)
  );

  return jsonb_build_object('status', 'joined', 'group_id', v_invite.group_id);
end;
$$;

-- A group must always keep an admin: promote the longest-standing member
-- when the last admin leaves, and drop groups nobody is left in.
create or replace function private.group_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.groups where id = old.group_id) then
    return old;
  end if;

  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin') then
    update public.group_members
       set role = 'admin'
     where id = (
       select id from public.group_members
        where group_id = old.group_id
        order by joined_at, id
        limit 1
     );
  end if;

  -- A departing member's shares and votes in open hangouts go with them.
  delete from public.hangout_locations hl
   using public.hangouts h
   where hl.hangout_id = h.id and h.group_id = old.group_id and hl.user_id = old.user_id
     and h.status not in ('finalized', 'cancelled');
  delete from public.venue_routes vr
   using public.hangouts h
   where vr.hangout_id = h.id and h.group_id = old.group_id and vr.user_id = old.user_id
     and h.status not in ('finalized', 'cancelled');
  return old;
end;
$$;

create trigger group_members_after_delete
  after delete on public.group_members
  for each row execute function private.group_members_after_delete();

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.group_members where group_id = p_group_id and user_id = v_uid;
  if not found then
    raise exception using message = 'not_found', detail = 'You are not a member of that group.';
  end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not private.is_group_admin(p_group_id) then
    raise exception using message = 'forbidden', detail = 'Only group admins can remove members.';
  end if;
  if p_user_id = v_uid then
    raise exception using message = 'invalid_input', detail = 'Use "Leave group" to remove yourself.';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if not found then
    raise exception using message = 'not_found', detail = 'That person is not in this group.';
  end if;

  perform private.notify(
    array[p_user_id], 'member_removed',
    format('You were removed from %s', (select name from public.groups where id = p_group_id)),
    null, null, null, '/groups'
  );
end;
$$;

create or replace function public.transfer_group_admin(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not private.is_group_admin(p_group_id) then
    raise exception using message = 'forbidden', detail = 'Only group admins can transfer admin rights.';
  end if;
  if p_user_id = v_uid then
    raise exception using message = 'invalid_input', detail = 'You are already an admin.';
  end if;

  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = p_user_id;
  if not found then
    raise exception using message = 'not_found', detail = 'That person is not in this group.';
  end if;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = v_uid;

  perform private.notify(
    array[p_user_id], 'admin_transferred',
    format('You are now an admin of %s', (select name from public.groups where id = p_group_id)),
    null, p_group_id, null, format('/groups/%s/members', p_group_id)
  );
end;
$$;

-- Group-level consent: "share my primary saved place with this group's
-- hangouts". Turning it on shares into open hangouts that have no share
-- from you yet; turning it off withdraws your shares from open hangouts.
create or replace function public.set_group_location_sharing(p_group_id uuid, p_enabled boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_loc public.user_locations;
  v_count integer := 0;
begin
  update public.group_members
     set location_sharing_enabled = p_enabled,
         location_sharing_updated_at = now()
   where group_id = p_group_id and user_id = v_uid;
  if not found then
    raise exception using message = 'not_found', detail = 'You are not a member of that group.';
  end if;

  if p_enabled then
    select * into v_loc from public.user_locations where user_id = v_uid and is_primary;
    if found then
      insert into public.hangout_locations
        (hangout_id, user_id, latitude, longitude, formatted_address, label, source, source_location_id, consented_at)
      select h.id, v_uid, v_loc.latitude, v_loc.longitude, v_loc.formatted_address, v_loc.location_name,
             'saved', v_loc.id, now()
        from public.hangouts h
       where h.group_id = p_group_id
         and h.status not in ('finalized', 'cancelled')
      on conflict (hangout_id, user_id) do nothing;
      get diagnostics v_count = row_count;
    end if;
  else
    delete from public.venue_routes vr
     using public.hangouts h
     where vr.hangout_id = h.id and h.group_id = p_group_id and vr.user_id = v_uid
       and h.status not in ('finalized', 'cancelled');
    delete from public.hangout_locations hl
     using public.hangouts h
     where hl.hangout_id = h.id and h.group_id = p_group_id and hl.user_id = v_uid
       and h.status not in ('finalized', 'cancelled');
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Hangouts
-- ---------------------------------------------------------------------
create or replace function public.create_hangout(
  p_group_id uuid,
  p_title text,
  p_notes text default null,
  p_scheduled_for timestamptz default null,
  p_travel_mode public.travel_mode default 'DRIVE',
  p_strategy public.optimization_strategy default 'fair',
  p_activity_mode public.activity_mode default 'all_selected',
  p_max_travel_minutes integer default null
)
returns public.hangouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_row public.hangouts;
begin
  if not private.is_group_member(p_group_id) then
    raise exception using message = 'not_found', detail = 'That group does not exist or you are not a member.';
  end if;
  if (select count(*) from public.hangouts
       where group_id = p_group_id and status not in ('finalized', 'cancelled')) >= 20 then
    raise exception using message = 'hangout_limit_reached',
      detail = 'This group already has 20 open hangouts. Finish or cancel one first.';
  end if;
  perform private.check_rate_limit('create_hangout', 30, interval '1 hour');

  insert into public.hangouts
    (group_id, title, notes, scheduled_for, travel_mode, optimization_strategy, activity_mode,
     max_travel_minutes, created_by, status)
  values
    (p_group_id, trim(p_title), nullif(trim(coalesce(p_notes, '')), ''), p_scheduled_for,
     coalesce(p_travel_mode, 'DRIVE'), coalesce(p_strategy, 'fair'), coalesce(p_activity_mode, 'all_selected'),
     p_max_travel_minutes, v_uid, 'waiting_for_locations')
  returning * into v_row;

  -- Members who opted in at group level share their primary place now.
  insert into public.hangout_locations
    (hangout_id, user_id, latitude, longitude, formatted_address, label, source, source_location_id, consented_at)
  select v_row.id, m.user_id, l.latitude, l.longitude, l.formatted_address, l.location_name,
         'saved', l.id, coalesce(m.location_sharing_updated_at, now())
    from public.group_members m
    join public.user_locations l on l.user_id = m.user_id and l.is_primary
   where m.group_id = p_group_id
     and m.location_sharing_enabled
  on conflict (hangout_id, user_id) do nothing;

  perform private.notify(
    private.group_member_ids(p_group_id, v_uid),
    'hangout_created',
    format('New hangout: %s', v_row.title),
    format('Share your location and pick what you''d like to do in %s.',
           (select name from public.groups where id = p_group_id)),
    p_group_id, v_row.id, format('/hangouts/%s', v_row.id)
  );
  return v_row;
end;
$$;

create or replace function public.set_hangout_status(
  p_hangout_id uuid,
  p_status public.hangout_status,
  p_voting_deadline timestamptz default null
)
returns public.hangouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hangouts := private.member_hangout(p_hangout_id, true);
  v_has_venues boolean;
begin
  if not private.can_manage_hangout(p_hangout_id) then
    raise exception using message = 'forbidden', detail = 'Only the organiser or a group admin can do that.';
  end if;
  if p_status in ('draft', 'calculating', 'finalized') then
    raise exception using message = 'invalid_transition', detail = 'That status cannot be set directly.';
  end if;
  if v_row.status = 'calculating' and p_status <> 'cancelled' then
    raise exception using message = 'calculation_running', detail = 'Wait for the calculation to finish.';
  end if;
  if v_row.status = 'cancelled' and p_status not in ('waiting_for_locations', 'activity_selection') then
    raise exception using message = 'invalid_transition', detail = 'Restore the hangout before moving on.';
  end if;

  v_has_venues := exists (select 1 from public.venues where hangout_id = p_hangout_id);
  if p_status in ('venue_discovery', 'voting') and not v_has_venues then
    raise exception using message = 'no_venues', detail = 'Find a meeting point and venues first.';
  end if;
  if p_voting_deadline is not null and p_voting_deadline <= now() then
    raise exception using message = 'invalid_deadline', detail = 'The voting deadline must be in the future.';
  end if;

  update public.hangouts
     set status = p_status,
         voting_deadline = case when p_status = 'voting' then p_voting_deadline else voting_deadline end,
         selected_venue_id = case when v_row.status = 'finalized' then null else selected_venue_id end,
         finalized_at = case when v_row.status = 'finalized' then null else finalized_at end,
         finalized_by = case when v_row.status = 'finalized' then null else finalized_by end,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = p_hangout_id
  returning * into v_row;

  if p_status = 'voting' then
    perform private.notify(
      private.group_member_ids(v_row.group_id, auth.uid()),
      'voting_open',
      format('Vote on where to meet: %s', v_row.title),
      case when p_voting_deadline is not null then 'Voting closes soon.' else null end,
      v_row.group_id, v_row.id, format('/hangouts/%s/vote', v_row.id)
    );
  elsif p_status = 'cancelled' then
    perform private.notify(
      private.group_member_ids(v_row.group_id, auth.uid()),
      'hangout_cancelled', format('%s was cancelled', v_row.title), null,
      v_row.group_id, v_row.id, format('/hangouts/%s', v_row.id)
    );
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Location sharing for a hangout
-- ---------------------------------------------------------------------
create or replace function public.share_hangout_location(
  p_hangout_id uuid,
  p_source public.location_source,
  p_saved_location_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_address text default null,
  p_label text default null
)
returns public.hangout_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
  v_loc public.user_locations;
  v_lat double precision;
  v_lng double precision;
  v_address text;
  v_label text;
  v_row public.hangout_locations;
begin
  if not private.hangout_is_open(v_hangout.status) then
    raise exception using message = 'hangout_closed', detail = 'This hangout is closed.';
  end if;

  if p_source = 'saved' then
    select * into v_loc from public.user_locations where id = p_saved_location_id and user_id = v_uid;
    if not found then
      raise exception using message = 'not_found', detail = 'That saved place no longer exists.';
    end if;
    v_lat := v_loc.latitude;
    v_lng := v_loc.longitude;
    v_address := v_loc.formatted_address;
    v_label := v_loc.location_name;
  else
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception using message = 'invalid_input', detail = 'Pick a location on the map first.';
    end if;
    v_lat := p_latitude;
    v_lng := p_longitude;
    v_address := left(nullif(trim(coalesce(p_address, '')), ''), 300);
    v_label := left(coalesce(nullif(trim(coalesce(p_label, '')), ''),
                             case when p_source = 'current' then 'Current location' else 'Pinned location' end), 40);
  end if;

  insert into public.hangout_locations
    (hangout_id, user_id, latitude, longitude, formatted_address, label, source, source_location_id, consented_at)
  values
    (p_hangout_id, v_uid, v_lat, v_lng, v_address, v_label, p_source,
     case when p_source = 'saved' then v_loc.id end, now())
  on conflict (hangout_id, user_id) do update
    set latitude = excluded.latitude,
        longitude = excluded.longitude,
        formatted_address = excluded.formatted_address,
        label = excluded.label,
        source = excluded.source,
        source_location_id = excluded.source_location_id,
        consented_at = excluded.consented_at
  returning * into v_row;

  -- Routes computed from an old position are no longer valid.
  delete from public.venue_routes where hangout_id = p_hangout_id and user_id = v_uid and polyline is not null;
  perform private.mark_inputs_changed(p_hangout_id);
  return v_row;
end;
$$;

create or replace function public.stop_sharing_hangout_location(p_hangout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
begin
  delete from public.hangout_locations where hangout_id = p_hangout_id and user_id = v_uid;
  if private.hangout_is_open(v_hangout.status) then
    delete from public.venue_routes where hangout_id = p_hangout_id and user_id = v_uid;
  else
    -- Finalized plans keep travel times but drop the drawn route.
    update public.venue_routes set polyline = null where hangout_id = p_hangout_id and user_id = v_uid;
  end if;
  perform private.mark_inputs_changed(p_hangout_id);
end;
$$;

-- Editing a saved place updates the shares made from it in open hangouts.
create or replace function private.user_locations_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.latitude, new.longitude, new.formatted_address, new.location_name)
     is distinct from (old.latitude, old.longitude, old.formatted_address, old.location_name) then
    with changed as (
      update public.hangout_locations hl
         set latitude = new.latitude,
             longitude = new.longitude,
             formatted_address = new.formatted_address,
             label = new.location_name
        from public.hangouts h
       where hl.source_location_id = new.id
         and h.id = hl.hangout_id
         and h.status not in ('finalized', 'cancelled')
      returning hl.hangout_id
    )
    update public.hangouts
       set inputs_changed_at = now()
     where id in (select hangout_id from changed)
       and last_calculated_at is not null;
  end if;
  return new;
end;
$$;

create trigger user_locations_after_update
  after update on public.user_locations
  for each row execute function private.user_locations_after_update();

-- ---------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------
-- Voting for an activity also adds it to the hangout's shortlist; removing
-- the last vote takes it off again.
create or replace function public.toggle_activity_vote(
  p_hangout_id uuid,
  p_activity_id uuid,
  p_vote boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
  v_activity public.activities;
begin
  if not private.hangout_is_open(v_hangout.status) then
    raise exception using message = 'hangout_closed', detail = 'This hangout is closed.';
  end if;
  select * into v_activity from public.activities where id = p_activity_id;
  if not found or (v_activity.hangout_id is not null and v_activity.hangout_id <> p_hangout_id) then
    raise exception using message = 'not_found', detail = 'Activity not found.';
  end if;

  if p_vote then
    if not exists (select 1 from public.hangout_activities where hangout_id = p_hangout_id and activity_id = p_activity_id)
       and (select count(*) from public.hangout_activities where hangout_id = p_hangout_id) >= 12 then
      raise exception using message = 'activity_limit_reached', detail = 'A hangout can shortlist up to 12 activities.';
    end if;
    insert into public.hangout_activities (hangout_id, activity_id, created_by)
    values (p_hangout_id, p_activity_id, v_uid)
    on conflict (hangout_id, activity_id) do nothing;
    if found then
      perform private.mark_inputs_changed(p_hangout_id);
    end if;
    insert into public.activity_votes (hangout_id, activity_id, user_id)
    values (p_hangout_id, p_activity_id, v_uid)
    on conflict (hangout_id, activity_id, user_id) do nothing;
  else
    delete from public.activity_votes
     where hangout_id = p_hangout_id and activity_id = p_activity_id and user_id = v_uid;
    delete from public.hangout_activities ha
     where ha.hangout_id = p_hangout_id and ha.activity_id = p_activity_id
       and not exists (
         select 1 from public.activity_votes v
          where v.hangout_id = ha.hangout_id and v.activity_id = ha.activity_id
       );
    if found then
      perform private.mark_inputs_changed(p_hangout_id);
    end if;
  end if;

  if v_hangout.activity_mode = 'most_popular' then
    perform private.mark_inputs_changed(p_hangout_id);
  end if;
end;
$$;

create or replace function public.add_custom_activity(p_hangout_id uuid, p_name text)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_row public.activities;
begin
  if not private.hangout_is_open(v_hangout.status) then
    raise exception using message = 'hangout_closed', detail = 'This hangout is closed.';
  end if;
  if char_length(v_name) not between 2 and 40 then
    raise exception using message = 'invalid_input', detail = 'Activity names are 2 to 40 characters.';
  end if;

  select * into v_row from public.activities
   where (hangout_id = p_hangout_id or hangout_id is null) and lower(name) = lower(v_name)
   limit 1;
  if not found then
    if (select count(*) from public.activities where hangout_id = p_hangout_id) >= 10 then
      raise exception using message = 'activity_limit_reached', detail = 'Up to 10 custom activities per hangout.';
    end if;
    insert into public.activities (name, category, icon, places_query, is_custom, hangout_id, created_by, sort_order)
    values (v_name, 'other', 'sparkles', v_name, true, p_hangout_id, v_uid, 1000)
    returning * into v_row;
  end if;

  perform public.toggle_activity_vote(p_hangout_id, v_row.id, true);
  return v_row;
end;
$$;

create or replace function public.remove_hangout_activity(p_hangout_id uuid, p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
begin
  if not private.can_manage_hangout(p_hangout_id) then
    raise exception using message = 'forbidden', detail = 'Only the organiser or a group admin can remove activities.';
  end if;
  if not private.hangout_is_open(v_hangout.status) then
    raise exception using message = 'hangout_closed', detail = 'This hangout is closed.';
  end if;
  delete from public.hangout_activities where hangout_id = p_hangout_id and activity_id = p_activity_id;
  perform private.mark_inputs_changed(p_hangout_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Venue voting and finalisation
-- ---------------------------------------------------------------------
create or replace function public.cast_venue_vote(p_hangout_id uuid, p_venue_id uuid)
returns public.venue_votes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
  v_row public.venue_votes;
begin
  if v_hangout.status not in ('venue_discovery', 'voting') then
    raise exception using message = 'voting_closed', detail = 'Voting is not open for this hangout.';
  end if;
  if v_hangout.voting_deadline is not null and v_hangout.voting_deadline <= now() then
    raise exception using message = 'voting_closed', detail = 'The voting deadline has passed.';
  end if;
  if not exists (select 1 from public.venues where id = p_venue_id and hangout_id = p_hangout_id) then
    raise exception using message = 'not_found', detail = 'That venue is not part of this hangout.';
  end if;

  insert into public.venue_votes (hangout_id, venue_id, user_id)
  values (p_hangout_id, p_venue_id, v_uid)
  on conflict (hangout_id, user_id) do update
    set venue_id = excluded.venue_id, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.clear_venue_vote(p_hangout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_hangout public.hangouts := private.member_hangout(p_hangout_id);
begin
  if v_hangout.status not in ('venue_discovery', 'voting') then
    raise exception using message = 'voting_closed', detail = 'Voting is not open for this hangout.';
  end if;
  delete from public.venue_votes where hangout_id = p_hangout_id and user_id = v_uid;
end;
$$;

create or replace function public.finalize_hangout(p_hangout_id uuid, p_venue_id uuid)
returns public.hangouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_row public.hangouts := private.member_hangout(p_hangout_id, true);
  v_venue public.venues;
begin
  if not private.can_manage_hangout(p_hangout_id) then
    raise exception using message = 'forbidden', detail = 'Only the organiser or a group admin can finalise.';
  end if;
  if v_row.status not in ('venue_discovery', 'voting') then
    raise exception using message = 'invalid_transition', detail = 'Find venues before finalising.';
  end if;
  select * into v_venue from public.venues where id = p_venue_id and hangout_id = p_hangout_id;
  if not found then
    raise exception using message = 'not_found', detail = 'That venue is not part of this hangout.';
  end if;

  update public.hangouts
     set status = 'finalized',
         selected_venue_id = p_venue_id,
         finalized_at = now(),
         finalized_by = v_uid,
         cancelled_at = null
   where id = p_hangout_id
  returning * into v_row;

  perform private.notify(
    private.group_member_ids(v_row.group_id, v_uid),
    'hangout_finalized',
    format('%s is set: %s', v_row.title, coalesce(v_venue.name, 'venue chosen')),
    'Open the plan for routes and directions.',
    v_row.group_id, v_row.id, format('/hangouts/%s/confirmed', v_row.id)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Notifications and account
-- ---------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = v_uid
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Deletes the auth user; every personal row cascades from there.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------
-- Service-role functions used by the Edge Functions
-- ---------------------------------------------------------------------
create or replace function public.start_calculation(
  p_hangout_id uuid,
  p_user_id uuid,
  p_input_hash text,
  p_force boolean default false,
  p_participant_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hangout public.hangouts;
  v_cached public.calculation_runs;
  v_run public.calculation_runs;
begin
  select * into v_hangout from public.hangouts where id = p_hangout_id for update;
  if not found or not exists (
    select 1 from public.group_members where group_id = v_hangout.group_id and user_id = p_user_id
  ) then
    raise exception using message = 'not_found', detail = 'That hangout does not exist or you are not a member.';
  end if;
  if not private.hangout_is_open(v_hangout.status) then
    raise exception using message = 'hangout_closed', detail = 'This hangout is closed.';
  end if;

  -- Runs that never reported back (function crashed) time out.
  update public.calculation_runs
     set status = 'failed', error_code = 'timeout', error_message = 'The calculation did not finish.',
         finished_at = now()
   where hangout_id = p_hangout_id and status = 'running' and started_at < now() - interval '2 minutes';
  if found and v_hangout.status = 'calculating' then
    update public.hangouts
       set status = coalesce((select previous_status from public.calculation_runs
                               where hangout_id = p_hangout_id and error_code = 'timeout'
                               order by started_at desc limit 1), 'activity_selection')
     where id = p_hangout_id
    returning * into v_hangout;
  end if;

  if exists (select 1 from public.calculation_runs where hangout_id = p_hangout_id and status = 'running') then
    raise exception using message = 'already_running', detail = 'A calculation is already running for this hangout.';
  end if;

  if not coalesce(p_force, false) then
    select * into v_cached
      from public.calculation_runs
     where hangout_id = p_hangout_id
       and status = 'succeeded'
       and input_hash = p_input_hash
       and finished_at > now() - interval '20 minutes'
       and id = v_hangout.last_run_id
     order by finished_at desc
     limit 1;
    if found then
      return jsonb_build_object('cached', true, 'run_id', v_cached.id);
    end if;
  end if;

  perform private.check_rate_limit('calculate', 8, interval '1 hour', p_user_id);
  if (select count(*) from public.calculation_runs
       where hangout_id = p_hangout_id and started_at > now() - interval '1 day') >= 40 then
    raise exception using message = 'rate_limited', detail = 'This hangout has been recalculated too often today.';
  end if;

  insert into public.calculation_runs
    (hangout_id, requested_by, input_hash, strategy, travel_mode, previous_status, participant_count)
  values
    (p_hangout_id, p_user_id, p_input_hash, v_hangout.optimization_strategy, v_hangout.travel_mode,
     v_hangout.status, coalesce(p_participant_count, 0))
  returning * into v_run;

  update public.hangouts set status = 'calculating' where id = p_hangout_id;
  return jsonb_build_object('cached', false, 'run_id', v_run.id);
end;
$$;

create or replace function public.complete_calculation(p_run_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.calculation_runs;
  v_hangout public.hangouts;
  v_venue jsonb;
  v_route jsonb;
  v_venue_id uuid;
  v_place_ids text[] := '{}';
  v_count integer := 0;
  v_expires timestamptz := now() + interval '30 days';
begin
  select * into v_run from public.calculation_runs where id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception using message = 'invalid_run', detail = 'Run not found or already finished.';
  end if;
  select * into v_hangout from public.hangouts where id = v_run.hangout_id for update;

  for v_venue in select * from jsonb_array_elements(coalesce(p_result -> 'venues', '[]'::jsonb)) loop
    v_place_ids := v_place_ids || (v_venue ->> 'placeId');

    insert into public.venues as v (
      hangout_id, run_id, activity_id, google_place_id, name, address, latitude, longitude, rating,
      rating_count, price_level, primary_type, primary_type_label, google_maps_uri, photo_uri,
      photo_attributions, opening_hours, open_now, business_status, distance_from_area_m, rank,
      avg_travel_seconds, max_travel_seconds, min_travel_seconds, total_travel_seconds, spread_seconds,
      reachable_count, participant_count, routes_complete, within_limit, explanation, content_expires_at
    ) values (
      v_run.hangout_id, v_run.id,
      (select a.id from public.activities a where a.id = private.try_uuid(v_venue ->> 'activityId')),
      v_venue ->> 'placeId',
      left(v_venue ->> 'name', 200),
      left(v_venue ->> 'address', 300),
      (v_venue ->> 'lat')::double precision,
      (v_venue ->> 'lng')::double precision,
      (v_venue ->> 'rating')::numeric(2, 1),
      (v_venue ->> 'ratingCount')::integer,
      v_venue ->> 'priceLevel',
      v_venue ->> 'primaryType',
      left(v_venue ->> 'primaryTypeLabel', 80),
      left(v_venue ->> 'googleMapsUri', 600),
      left(v_venue ->> 'photoUri', 2000),
      v_venue -> 'photoAttributions',
      v_venue -> 'openingHours',
      (v_venue ->> 'openNow')::boolean,
      v_venue ->> 'businessStatus',
      (v_venue ->> 'distanceFromAreaMeters')::integer,
      (v_venue ->> 'rank')::integer,
      (v_venue #>> '{summary,avg}')::integer,
      (v_venue #>> '{summary,max}')::integer,
      (v_venue #>> '{summary,min}')::integer,
      (v_venue #>> '{summary,total}')::integer,
      (v_venue #>> '{summary,spread}')::integer,
      (v_venue #>> '{summary,reachable}')::integer,
      (v_venue #>> '{summary,participants}')::integer,
      coalesce((v_venue #>> '{summary,complete}')::boolean, false),
      (v_venue #>> '{summary,withinLimit}')::boolean,
      left(v_venue ->> 'explanation', 500),
      v_expires
    )
    on conflict (hangout_id, google_place_id) do update set
      run_id = excluded.run_id, activity_id = excluded.activity_id, name = excluded.name,
      address = excluded.address, latitude = excluded.latitude, longitude = excluded.longitude,
      rating = excluded.rating, rating_count = excluded.rating_count, price_level = excluded.price_level,
      primary_type = excluded.primary_type, primary_type_label = excluded.primary_type_label,
      google_maps_uri = excluded.google_maps_uri, photo_uri = excluded.photo_uri,
      photo_attributions = excluded.photo_attributions, opening_hours = excluded.opening_hours,
      open_now = excluded.open_now, business_status = excluded.business_status,
      distance_from_area_m = excluded.distance_from_area_m, rank = excluded.rank,
      avg_travel_seconds = excluded.avg_travel_seconds, max_travel_seconds = excluded.max_travel_seconds,
      min_travel_seconds = excluded.min_travel_seconds, total_travel_seconds = excluded.total_travel_seconds,
      spread_seconds = excluded.spread_seconds, reachable_count = excluded.reachable_count,
      participant_count = excluded.participant_count, routes_complete = excluded.routes_complete,
      within_limit = excluded.within_limit, explanation = excluded.explanation,
      content_expires_at = excluded.content_expires_at
    returning v.id into v_venue_id;

    delete from public.venue_routes where venue_id = v_venue_id;
    for v_route in select * from jsonb_array_elements(coalesce(v_venue -> 'routes', '[]'::jsonb)) loop
      insert into public.venue_routes
        (venue_id, hangout_id, user_id, travel_mode, travel_time_seconds, distance_meters, condition)
      select v_venue_id, v_run.hangout_id, p.id, v_run.travel_mode,
             (v_route ->> 'durationSeconds')::integer,
             (v_route ->> 'distanceMeters')::integer,
             coalesce(left(v_route ->> 'condition', 40), 'ROUTE_EXISTS')
        from public.profiles p
       where p.id = private.try_uuid(v_route ->> 'userId')
      on conflict (venue_id, user_id) do nothing;
    end loop;
    v_count := v_count + 1;
  end loop;

  -- Venues the new run no longer recommends (and their votes) go away,
  -- except the one a finalised plan points at.
  delete from public.venues
   where hangout_id = v_run.hangout_id
     and not (google_place_id = any (v_place_ids))
     and id is distinct from v_hangout.selected_venue_id;

  update public.calculation_runs set
    status = 'succeeded',
    finished_at = now(),
    center_lat = (p_result #>> '{center,lat}')::double precision,
    center_lng = (p_result #>> '{center,lng}')::double precision,
    area_lat = (p_result #>> '{area,lat}')::double precision,
    area_lng = (p_result #>> '{area,lng}')::double precision,
    area_kind = left(p_result #>> '{area,kind}', 40),
    area_metrics = p_result -> 'areas',
    activities_used = p_result -> 'activitiesUsed',
    venues_considered = (p_result ->> 'venuesConsidered')::integer,
    routes_requested = (p_result ->> 'routesRequested')::integer,
    routes_failed = (p_result ->> 'routesFailed')::integer,
    warnings = p_result -> 'warnings',
    content_expires_at = v_expires
  where id = p_run_id;

  update public.hangouts set
    status = case when v_run.previous_status = 'voting' then 'voting'::public.hangout_status
                  else 'venue_discovery'::public.hangout_status end,
    meeting_point_lat = (p_result #>> '{area,lat}')::double precision,
    meeting_point_lng = (p_result #>> '{area,lng}')::double precision,
    last_run_id = p_run_id,
    last_calculated_at = now(),
    inputs_changed_at = null
  where id = v_run.hangout_id
    and status = 'calculating';

  return jsonb_build_object('venue_count', v_count);
end;
$$;

create or replace function public.fail_calculation(p_run_id uuid, p_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.calculation_runs;
begin
  update public.calculation_runs
     set status = 'failed', finished_at = now(),
         error_code = left(coalesce(p_code, 'internal'), 60),
         error_message = left(p_message, 500)
   where id = p_run_id and status = 'running'
  returning * into v_run;
  if found then
    update public.hangouts
       set status = coalesce(v_run.previous_status, 'activity_selection')
     where id = v_run.hangout_id and status = 'calculating';
  end if;
end;
$$;

-- Google Maps Platform terms allow temporary caching of Places/Routes
-- content (30 days). Schedule this daily (pg_cron, see README). Place IDs
-- are kept; everything else is dropped. Finalised plans keep the venue row
-- with its ID so the app can refresh details on demand.
create or replace function public.purge_expired_google_content()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_scrubbed integer;
begin
  delete from public.venues v
   where v.content_expires_at < now()
     and not exists (select 1 from public.hangouts h where h.selected_venue_id = v.id);
  get diagnostics v_deleted = row_count;

  update public.venues v
     set name = null, address = null, latitude = null, longitude = null, rating = null,
         rating_count = null, price_level = null, primary_type_label = null, google_maps_uri = null,
         photo_uri = null, photo_attributions = null, opening_hours = null, open_now = null,
         explanation = null
   where v.content_expires_at < now()
     and v.name is not null;
  get diagnostics v_scrubbed = row_count;

  delete from public.venue_routes vr
   using public.venues v
   where vr.venue_id = v.id and v.content_expires_at < now();

  update public.calculation_runs
     set area_metrics = null
   where content_expires_at < now() and area_metrics is not null;

  return jsonb_build_object('deleted_venues', v_deleted, 'scrubbed_venues', v_scrubbed);
end;
$$;

-- ---------------------------------------------------------------------
-- Execute grants. Nothing is callable unless granted here.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  private.is_group_member(uuid),
  private.is_group_admin(uuid),
  private.is_hangout_member(uuid),
  private.can_manage_hangout(uuid),
  private.shares_group_with(uuid),
  private.try_uuid(text)
to authenticated, service_role;

grant execute on function public.get_invitation_preview(text) to anon, authenticated;

grant execute on function
  public.create_group(text, text, text, text),
  public.create_group_invitation(uuid, integer, integer),
  public.revoke_group_invitation(uuid),
  public.join_group_with_code(text),
  public.leave_group(uuid),
  public.remove_group_member(uuid, uuid),
  public.transfer_group_admin(uuid, uuid),
  public.set_group_location_sharing(uuid, boolean),
  public.create_hangout(uuid, text, text, timestamptz, public.travel_mode, public.optimization_strategy,
                        public.activity_mode, integer),
  public.set_hangout_status(uuid, public.hangout_status, timestamptz),
  public.share_hangout_location(uuid, public.location_source, uuid, double precision, double precision, text, text),
  public.stop_sharing_hangout_location(uuid),
  public.toggle_activity_vote(uuid, uuid, boolean),
  public.add_custom_activity(uuid, text),
  public.remove_hangout_activity(uuid, uuid),
  public.cast_venue_vote(uuid, uuid),
  public.clear_venue_vote(uuid),
  public.finalize_hangout(uuid, uuid),
  public.mark_notifications_read(uuid[]),
  public.delete_my_account()
to authenticated;

grant execute on function
  public.start_calculation(uuid, uuid, text, boolean, integer),
  public.complete_calculation(uuid, jsonb),
  public.fail_calculation(uuid, text, text),
  public.purge_expired_google_content()
to service_role;
