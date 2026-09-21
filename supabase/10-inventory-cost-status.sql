-- Distinguish a genuinely free item from an imported item whose cost is not known yet.
alter table public.inventory_items
  add column if not exists cost_status text not null default 'known'
  check (cost_status in ('unknown','known','free'));

-- Existing eBay bootstrap rows used 0 only as a placeholder. Mark those unknown.
update public.inventory_items
set cost_status = 'unknown'
where purchase_cost = 0
  and source in ('Imported from eBay','Imported from eBay Draft');

-- Any explicitly free item should keep purchase_cost at zero and use cost_status='free'.
