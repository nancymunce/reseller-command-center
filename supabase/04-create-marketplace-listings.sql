-- Reseller Command Center: marketplace listing model
-- Run in Supabase SQL Editor when ready. Safe to create before eBay credentials exist.

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  marketplace text not null,
  external_listing_id text not null,
  external_sku text,
  listing_url text,
  title text,
  status text not null default 'active',
  quantity integer,
  price numeric(12,2),
  currency text default 'USD',
  image_urls text[] default '{}',
  raw_data jsonb,
  listed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, marketplace, external_listing_id)
);

alter table public.marketplace_listings enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.marketplace_listings to authenticated;
revoke all on table public.marketplace_listings from anon;

drop policy if exists "Users can read own marketplace listings" on public.marketplace_listings;
create policy "Users can read own marketplace listings"
on public.marketplace_listings for select to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can insert own marketplace listings" on public.marketplace_listings;
create policy "Users can insert own marketplace listings"
on public.marketplace_listings for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Users can update own marketplace listings" on public.marketplace_listings;
create policy "Users can update own marketplace listings"
on public.marketplace_listings for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Users can delete own marketplace listings" on public.marketplace_listings;
create policy "Users can delete own marketplace listings"
on public.marketplace_listings for delete to authenticated
using (owner_id = auth.uid());

create index if not exists marketplace_listings_inventory_item_idx
  on public.marketplace_listings(inventory_item_id);
create index if not exists marketplace_listings_marketplace_idx
  on public.marketplace_listings(marketplace);
create index if not exists marketplace_listings_status_idx
  on public.marketplace_listings(status);

-- Keep updated_at current without requiring the browser to manage it.
drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at
before update on public.marketplace_listings
for each row execute function public.set_updated_at();
