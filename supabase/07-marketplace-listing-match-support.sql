-- Marketplace listing match-review support.
-- Adds review metadata only; it does not change existing inventory records.

alter table public.marketplace_listings
  add column if not exists match_status text not null default 'unreviewed'
    check (match_status in ('unreviewed', 'suggested', 'confirmed', 'no_match')),
  add column if not exists suggested_inventory_item_id uuid
    references public.inventory_items(id) on delete set null,
  add column if not exists match_score numeric(5,2),
  add column if not exists match_reason text,
  add column if not exists match_reviewed_at timestamptz;

create index if not exists marketplace_listings_match_status_idx
  on public.marketplace_listings(match_status);

create index if not exists marketplace_listings_suggested_inventory_idx
  on public.marketplace_listings(suggested_inventory_item_id);
