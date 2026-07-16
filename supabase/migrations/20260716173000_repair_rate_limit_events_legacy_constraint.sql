-- Older installations used request_key. The current limiter writes rate_key,
-- so preserve legacy values but stop requiring the retired column on inserts.

alter table public.rate_limit_events
  add column if not exists request_key text,
  add column if not exists rate_key text,
  add column if not exists request_id uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.rate_limit_events
set rate_key = request_key
where rate_key is null and request_key is not null;

update public.rate_limit_events
set request_id = gen_random_uuid()
where request_id is null;

alter table public.rate_limit_events
  alter column request_key drop not null,
  alter column rate_key set not null,
  alter column request_id set not null;

create index if not exists rate_limit_events_key_created_at_idx
  on public.rate_limit_events (rate_key, created_at desc);
