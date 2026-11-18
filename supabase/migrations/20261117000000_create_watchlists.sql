create table if not exists public.watchlists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wallet_address text not null,
  token_address text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, wallet_address, token_address),
  constraint watchlists_wallet_address_length check (char_length(wallet_address) between 32 and 44),
  constraint watchlists_token_address_length check (char_length(token_address) between 32 and 44)
);

alter table public.watchlists enable row level security;

create policy "Users can read their own watchlists"
  on public.watchlists for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own watchlists"
  on public.watchlists for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own watchlists"
  on public.watchlists for delete to authenticated
  using ((select auth.uid()) = user_id);
