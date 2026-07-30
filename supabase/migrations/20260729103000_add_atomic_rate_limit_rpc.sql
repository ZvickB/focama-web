-- Keep the shared rate-limit decision to one database round trip. The prior
-- client sequence deleted, inserted, then counted in separate requests.
-- Per-key advisory locking preserves the intended rolling-window semantics
-- when multiple Render instances receive requests at the same time.

create or replace function public.consume_rate_limit_token(
  p_rate_key text,
  p_limit integer,
  p_window_ms integer,
  p_request_id uuid
)
returns table (
  allowed boolean,
  remaining integer,
  event_count integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_time timestamptz := timezone('utc', now());
  window_start timestamptz := current_time - (p_window_ms * interval '1 millisecond');
  oldest_event_at timestamptz;
  current_event_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_rate_key));

  delete from public.rate_limit_events
  where rate_key = p_rate_key
    and created_at < window_start;

  insert into public.rate_limit_events (created_at, rate_key, request_id)
  values (current_time, p_rate_key, p_request_id);

  select count(*)::integer, min(created_at)
  into current_event_count, oldest_event_at
  from public.rate_limit_events
  where rate_key = p_rate_key
    and created_at >= window_start;

  return query
  select
    current_event_count <= p_limit,
    greatest(p_limit - current_event_count, 0),
    current_event_count,
    oldest_event_at + (p_window_ms * interval '1 millisecond');
end;
$$;

revoke all on function public.consume_rate_limit_token(text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit_token(text, integer, integer, uuid)
  to service_role;
