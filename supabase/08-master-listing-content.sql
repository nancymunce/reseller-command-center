-- Master listing content for cross-listing.
-- Adds reusable listing details to the physical inventory record.
-- Existing inventory data is preserved.

alter table public.inventory_items
  add column if not exists listing_title text,
  add column if not exists listing_description text,
  add column if not exists condition_label text,
  add column if not exists condition_notes text,
  add column if not exists measurements text,
  add column if not exists weight_oz numeric(10,2),
  add column if not exists package_length_in numeric(10,2),
  add column if not exists package_width_in numeric(10,2),
  add column if not exists package_height_in numeric(10,2),
  add column if not exists image_urls text[] default '{}',
  add column if not exists target_price numeric(12,2),
  add column if not exists minimum_price numeric(12,2),
  add column if not exists master_sku text,
  add column if not exists listing_tags text[] default '{}';

create unique index if not exists inventory_items_owner_master_sku_idx
  on public.inventory_items(owner_id, master_sku)
  where master_sku is not null;
