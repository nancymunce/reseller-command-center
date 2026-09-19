-- eBay OAuth support tables.
-- Tokens are deliberately NOT stored in browser-accessible marketplace tables.
-- Run only when we are ready to activate the eBay connection.

create table public.ebay_oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  state text not null unique,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.ebay_oauth_states enable row level security;

grant select, insert on public.ebay_oauth_states to authenticated;
revoke all on public.ebay_oauth_states from anon;

create policy "Users can create own eBay OAuth states"
  on public.ebay_oauth_states for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users can read own eBay OAuth states"
  on public.ebay_oauth_states for select to authenticated
  using (owner_id = auth.uid());

create index ebay_oauth_states_owner_idx on public.ebay_oauth_states(owner_id);
create index ebay_oauth_states_created_idx on public.ebay_oauth_states(created_at);
