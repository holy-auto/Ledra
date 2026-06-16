-- Security advisory remediation — anon/authenticated executable SECURITY DEFINER
-- functions (WARN 0028 / 0029), trigger-function subset.
--
-- These are all SECURITY DEFINER *trigger* functions (return type `trigger`).
-- Triggers fire in the context of the statement that touches their table and
-- do not require the invoking role to hold EXECUTE on the function, so removing
-- client EXECUTE has no functional effect — it only removes the ability to call
-- them directly via RPC (which would error anyway). service_role keeps EXECUTE.

revoke execute on function public.part_confirmation_signatures_guard() from public, anon, authenticated;
grant  execute on function public.part_confirmation_signatures_guard() to service_role;

revoke execute on function public.part_evidence_append_only() from public, anon, authenticated;
grant  execute on function public.part_evidence_append_only() to service_role;

revoke execute on function public.part_installations_guard() from public, anon, authenticated;
grant  execute on function public.part_installations_guard() to service_role;

revoke execute on function public.part_serial_registry_append_only() from public, anon, authenticated;
grant  execute on function public.part_serial_registry_append_only() to service_role;

revoke execute on function public.publish_mutual_reviews() from public, anon, authenticated;
grant  execute on function public.publish_mutual_reviews() to service_role;

revoke execute on function public.purchase_order_items_guard_response_qty() from public, anon, authenticated;
grant  execute on function public.purchase_order_items_guard_response_qty() to service_role;

revoke execute on function public.purchase_orders_guard_partner_response() from public, anon, authenticated;
grant  execute on function public.purchase_orders_guard_partner_response() to service_role;

revoke execute on function public.supply_partners_guard_protected_cols() from public, anon, authenticated;
grant  execute on function public.supply_partners_guard_protected_cols() to service_role;
