-- Applies the server access grant to databases where the initial watchlist
-- migration was already run before the grant was introduced.
grant select, insert, delete on table public.wallet_watchlists to service_role;
