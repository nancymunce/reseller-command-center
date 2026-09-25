-- eBay export metadata for master listing drafts.
-- Run in Supabase SQL Editor before wiring these fields into the live app.

alter table public.inventory_items
  add column if not exists ebay_category_id text,
  add column if not exists ebay_condition_id text,
  add column if not exists ebay_item_specifics jsonb not null default '{}'::jsonb;

comment on column public.inventory_items.ebay_category_id is 'Numeric eBay leaf category ID used only for Seller Hub export.';
comment on column public.inventory_items.ebay_condition_id is 'eBay condition ID used only for Seller Hub export; separate from human-readable item_condition.';
comment on column public.inventory_items.ebay_item_specifics is 'Marketplace-specific eBay item specifics keyed by aspect name.';
