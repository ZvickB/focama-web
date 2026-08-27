-- `current_time` is a PostgreSQL special value that resolves to `timetz`.
-- The original function also used it as a PL/pgSQL variable name, so the
-- INSERT resolved the special value and tried to put a time-only string into
-- the timestamptz `created_at` column. Use prefixed variables and keep `now()`
-- as timestamptz so the atomic shared limiter can execute successfully.

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
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - (p_window_ms * interval '1 millisecond');
  v_oldest_event_at timestamptz;
  v_event_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_rate_key));

  delete from public.rate_limit_events
  where rate_key = p_rate_key
    and created_at < v_window_start;

  insert into public.rate_limit_events (created_at, rate_key, request_id)
  values (v_now, p_rate_key, p_request_id);

  select count(*)::integer, min(created_at)
  into v_event_count, v_oldest_event_at
  from public.rate_limit_events
  where rate_key = p_rate_key
    and created_at >= v_window_start;

  return query
  select
    v_event_count <= p_limit,
    greatest(p_limit - v_event_count, 0),
    v_event_count,
    v_oldest_event_at + (p_window_ms * interval '1 millisecond');
end;
$$;

revoke all on function public.consume_rate_limit_token(text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit_token(text, integer, integer, uuid)
  to service_role;
