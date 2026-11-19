create table if not exists public.wallet_alerts (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text not null,
  condition_type text not null check (condition_type in ('price_above', 'price_below', 'liquidity_below', 'volume_above', 'risk_below')),
  target_value numeric not null check (target_value >= 0),
  channels jsonb not null default '{"push":true}'::jsonb,
  destination_ciphertext text,
  active boolean not null default true,
  last_observed_value numeric,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_alerts_wallet_address_length check (char_length(wallet_address) between 32 and 44),
  constraint wallet_alerts_token_address_length check (char_length(token_address) between 32 and 44)
);

create index if not exists wallet_alerts_active_token_idx on public.wallet_alerts (active, token_address);

create table if not exists public.wallet_alert_deliveries (
  id bigint generated always as identity primary key,
  alert_id uuid not null references public.wallet_alerts(id) on delete cascade,
  channel text not null,
  observed_value numeric not null,
  status text not null check (status in ('sent', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

alter table public.wallet_alerts enable row level security;
alter table public.wallet_alert_deliveries enable row level security;
grant select, insert, update, delete on public.wallet_alerts to service_role;
grant select, insert on public.wallet_alert_deliveries to service_role;
