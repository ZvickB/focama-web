-- Sightengine verdict cache
-- Run this in the Supabase SQL editor before implementing the application layer.
-- Only successful provider decisions belong here. Do not persist timeouts,
-- credential failures, invalid responses, or other analysis errors as verdicts.

create table if not exists public.sensitive_image_verdicts (
  image_url_hash text primary key,
  image_url text not null,
  verdict text not null,
  reasons jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  thresholds jsonb not null default '{}'::jsonb,
  decision_version text not null,
  provider text not null default 'sightengine',
  provider_request_id text not null default '',
  operations integer not null default 0,
  checked_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sensitive_image_verdicts_verdict_check
    check (verdict in ('show', 'hide')),
  constraint sensitive_image_verdicts_reasons_array_check
    check (jsonb_typeof(reasons) = 'array'),
  constraint sensitive_image_verdicts_signals_object_check
    check (jsonb_typeof(signals) = 'object'),
  constraint sensitive_image_verdicts_thresholds_object_check
    check (jsonb_typeof(thresholds) = 'object'),
  constraint sensitive_image_verdicts_operations_nonnegative_check
    check (operations >= 0)
);

create index if not exists sensitive_image_verdicts_checked_at_idx
  on public.sensitive_image_verdicts (checked_at desc);

create index if not exists sensitive_image_verdicts_decision_version_idx
  on public.sensitive_image_verdicts (decision_version);

alter table public.sensitive_image_verdicts enable row level security;

comment on table public.sensitive_image_verdicts is
  'Server-owned cache of successful Sightengine decisions for sensitive product images.';

comment on column public.sensitive_image_verdicts.image_url_hash is
  'SHA-256 hash of the conservatively normalized image URL.';

comment on column public.sensitive_image_verdicts.decision_version is
  'Application-controlled version covering provider models, thresholds, and decision logic.';
