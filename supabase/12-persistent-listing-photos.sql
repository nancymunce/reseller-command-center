-- Persistent listing photos.
-- Run in Supabase SQL Editor. Creates a private Storage bucket and owner-scoped policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.inventory_items
  add column if not exists listing_photo_paths text[] not null default '{}';

comment on column public.inventory_items.listing_photo_paths is
  'Private Supabase Storage object paths for persistent listing photos.';

drop policy if exists "Users can view own listing photos" on storage.objects;
create policy "Users can view own listing photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can upload own listing photos" on storage.objects;
create policy "Users can upload own listing photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can update own listing photos" on storage.objects;
create policy "Users can update own listing photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can delete own listing photos" on storage.objects;
create policy "Users can delete own listing photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
