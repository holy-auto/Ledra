export type BillingReason = "inactive" | "plan";

export function buildBillingDenyUrl(opts: { reason: BillingReason; action?: string; returnTo?: string }) {
  const qs = new URLSearchParams();
  qs.set("reason", opts.reason);
  if (opts.action) qs.set("action", opts.action);
  if (opts.returnTo) qs.set("return", opts.returnTo);
  return `/admin/billing?${qs.toString()}`;
}
