-- Master listing draft fields for inventory_items.
-- SAFE STAGING FILE ONLY: adding this file does not alter production Supabase.
-- Run manually in Supabase only after review.

alter table public.inventory_items
  add column if not exists listing_description text,
  add column if not exists item_condition text,
  add column if not exists research_notes text,
  add column if not exists draft_status text not null default 'inventory'
    check (draft_status in ('inventory','draft','approved','exported'));

comment on column public.inventory_items.listing_description is 'Canonical master-listing description; marketplace adaptations may differ.';
comment on column public.inventory_items.item_condition is 'Human/AI drafted condition statement for the master listing.';
comment on column public.inventory_items.research_notes is 'Private research/comps/identification notes; never public listing copy.';
comment on column public.inventory_items.draft_status is 'Master draft workflow state; independent of marketplace listing status.';
