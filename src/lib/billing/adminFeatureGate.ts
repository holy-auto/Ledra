import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl, BillingReason } from "@/lib/billing/billingRedirect";
import type { FeatureKey } from "@/lib/billing/planFeatures";

export type GateOk = {
  ok: true;
  tenantId: string;
  planTier: ReturnType<typeof normalizePlanTier>;
  isActive: true;
};

export type GateNgReason = BillingReason | "unauthorized" | "no_tenant" | "tenant_not_found";

export type GateNg = {
  ok: false;
  status: number;
  reason: GateNgReason;
  billing_url?: string;
  planTier?: ReturnType<typeof normalizePlanTier>;
  isActive?: boolean;
};

export type Gate = GateOk | GateNg;

/**
 * planFeatures.ts を唯一の基準にして「管理画面の実行権限」を判定する
 * - ok=false の場合は billing_url を返す（inactive/plan）
 */
export async function checkAdminFeature(feature: FeatureKey, returnTo: string): Promise<Gate> {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = (mem?.tenant_id as string | undefined) ?? undefined;
  if (!tenantId) {
    return { ok: false, status: 400, reason: "no_tenant" };
  }

  const { data: t, error } = await supabase
    .from("tenants")
    .select("plan_tier,is_active")
    .eq("id", tenantId)
    .single();

  if (error || !t) {
    return { ok: false, status: 404, reason: "tenant_not_found" };
  }

  const planTier = normalizePlanTier(t.plan_tier);
  const isActive = !!t.is_active;

  if (!isActive) {
    return {
      ok: false,
      status: 402,
      reason: "inactive",
      planTier,
      isActive,
      billing_url: buildBillingDenyUrl({ reason: "inactive", action: feature, returnTo }),
    };
  }

  if (!canUseFeature(planTier, feature)) {
    return {
      ok: false,
      status: 402,
      reason: "plan",
      planTier,
      isActive,
      billing_url: buildBillingDenyUrl({ reason: "plan", action: feature, returnTo }),
    };
  }

  return { ok: true, tenantId, planTier, isActive: true };
}

/**
 * route.ts 側で共通で返す JSON（フロントは billing_url に誘導できる）
 */
export function billingDenyResponse(g: Gate, feature: FeatureKey, returnTo: string) {
  if (g.ok) {
    return NextResponse.json({ error: "guard_unexpected_ok" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  if (g.reason === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (g.reason === "no_tenant") {
    return NextResponse.json({ error: "no_tenant" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (g.reason === "tenant_not_found") {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const billing_url =
    g.billing_url ?? buildBillingDenyUrl({ reason: (g.reason as BillingReason) ?? "plan", action: feature, returnTo });

  return NextResponse.json(
    {
      error: "billing_denied",
      reason: g.reason,
      action: feature,
      return: returnTo,
      billing_url,
      plan_tier: g.planTier ?? null,
      is_active: g.isActive ?? null,
    },
    { status: g.status ?? 402, headers: { "Cache-Control": "no-store" } }
  );
}


