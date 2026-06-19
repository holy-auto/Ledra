-- Security advisory remediation — public_bucket_allows_listing (WARN 0025)
--
-- The `assets` and `market` buckets are public (objects are served via their
-- public CDN URL, which does NOT go through storage.objects RLS). On top of
-- that they each carried a broad SELECT policy keyed only on bucket_id, which
-- lets any client enumerate *every* file in the bucket via the storage list
-- API — for `assets` that means listing every tenant's files cross-tenant.
--
-- A full audit of src/ shows the app only ever .upload()/.remove()s these
-- buckets and renders files through public URLs; it never calls .list() on
-- them. So the broad SELECT policies are pure over-exposure.
--
-- Drop the broad listing policies. Public URL reads are unaffected (public
-- bucket). For `assets`, the existing tenant-scoped `assets_tenant_rw` policy
-- still lets authenticated users access their own tenant folder via the API.

drop policy if exists assets_select on storage.objects;
drop policy if exists market_storage_select on storage.objects;
