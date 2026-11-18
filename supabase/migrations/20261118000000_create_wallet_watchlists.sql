create table if not exists public.wallet_watchlists (
  wallet_address text not null,
  token_address text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, token_address),
  constraint wallet_watchlists_wallet_address_length check (char_length(wallet_address) between 32 and 44),
  constraint wallet_watchlists_token_address_length check (char_length(token_address) between 32 and 44)
);

alter table public.wallet_watchlists enable row level security;

-- Browser clients never access this table directly. Server routes verify a
-- wallet signature and use the server-only Supabase secret key for access.
