-- Earlier rate-limit tables stored a fixed expiry time. The current rolling
-- window implementation uses created_at and does not write expires_at.

alter table public.rate_limit_events
  add column if not exists expires_at timestamptz;

alter table public.rate_limit_events
  alter column expires_at drop not null;
