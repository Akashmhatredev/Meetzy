-- =====================================================================
-- Per-user quota for Edge Function calls that spend Google Maps Platform
-- money outside the calculation flow (venue-routes: Place Details and
-- computeRoutes). Callable only by the service role.
-- =====================================================================
create or replace function public.consume_api_quota(
  p_user_id uuid,
  p_action text,
  p_max integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_action !~ '^[a-z_]{2,40}$' or p_max < 1 or p_window_seconds < 1 then
    raise exception using message = 'invalid_input', detail = 'Bad quota request.';
  end if;
  perform private.check_rate_limit(p_action, p_max, make_interval(secs => p_window_seconds), p_user_id);
end;
$$;

revoke execute on function public.consume_api_quota(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_quota(uuid, text, integer, integer) to service_role;
