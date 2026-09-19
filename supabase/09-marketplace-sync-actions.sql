-- Safe cross-marketplace synchronization queue.
-- Records actions that should happen on marketplace channels without
-- automatically changing a live marketplace listing.

create table public.marketplace_sync_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  marketplace_listing_id uuid references public.marketplace_listings(id) on delete cascade,
  marketplace text not null,
  action_type text not null
    check (action_type in ('end_listing', 'update_price', 'update_quantity', 'update_content', 'review')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),
  reason text,
  requested_payload jsonb,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  error_message text
);

alter table public.marketplace_sync_actions enable row level security;

grant select, insert, update, delete on public.marketplace_sync_actions to authenticated;
revoke all on public.marketplace_sync_actions from anon;

create policy "Users can read own marketplace sync actions"
  on public.marketplace_sync_actions for select to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert own marketplace sync actions"
  on public.marketplace_sync_actions for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users can update own marketplace sync actions"
  on public.marketplace_sync_actions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can delete own marketplace sync actions"
  on public.marketplace_sync_actions for delete to authenticated
  using (owner_id = auth.uid());

create index marketplace_sync_actions_inventory_idx
  on public.marketplace_sync_actions(inventory_item_id);

create index marketplace_sync_actions_status_idx
  on public.marketplace_sync_actions(status);

create unique index marketplace_sync_actions_pending_unique_idx
  on public.marketplace_sync_actions(marketplace_listing_id, action_type)
  where status in ('pending', 'approved', 'processing');
