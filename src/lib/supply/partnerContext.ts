/**
 * 供給パートナーポータルのサーバ側コンテキスト解決。
 *
 * agents の `resolveAgentContext` (src/lib/agent/statusGuard.ts) に相当するが、
 * supply_partners は owner_user_id ベースのため RPC を足さず、RLS スコープ済みの
 * 自己 SELECT で解決する (supply_partners_select ポリシー = owner 本人のみ)。
 *
 * 1 ユーザー = 1 パートナー (Phase 0 は単一 owner) を前提に最初の 1 件を返す。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSupplyPartnerStatus, type SupplyPartnerStatus } from "@/types/supply";

export interface SupplyPartnerContext {
  partnerId: string;
  status: SupplyPartnerStatus;
  name: string;
  userId: string;
}

/**
 * 認証ユーザーが owner の supply_partner を解決する。
 * パートナーでなければ null。
 */
export async function resolveSupplyPartnerContext(): Promise<SupplyPartnerContext | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  // RLS (supply_partners_select) により owner 本人の行のみ返る。
  const { data, error } = await supabase
    .from("supply_partners")
    .select("id, name, status")
    .eq("owner_user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  return {
    partnerId: data.id as string,
    status: normalizeSupplyPartnerStatus(data.status as string),
    name: (data.name as string) ?? "",
    userId: auth.user.id,
  };
}

/**
 * API route 用ガード。active 以外なら Response を返し、active なら context を返す。
 * statusGuard.enforceAgentStatus と同じ思想 (suspended / 審査中を弾く)。
 *
 * Usage:
 *   const gate = await requireActiveSupplyPartner();
 *   if (gate instanceof NextResponse) return gate;
 *   // gate は SupplyPartnerContext
 */
export async function requireActiveSupplyPartner(opts?: {
  allowPending?: boolean;
}): Promise<SupplyPartnerContext | NextResponse> {
  const ctx = await resolveSupplyPartnerContext();
  if (!ctx) {
    return NextResponse.json({ error: "supply partner not found" }, { status: 403 });
  }
  if (ctx.status === "suspended") {
    return NextResponse.json(
      { error: "account_suspended", message: "このアカウントは停止されています。" },
      { status: 403 },
    );
  }
  if (ctx.status === "active_pending_review" && !opts?.allowPending) {
    return NextResponse.json(
      { error: "feature_restricted", message: "現在アカウントは審査中です。正式開通後にご利用いただけます。" },
      { status: 403 },
    );
  }
  return ctx;
}
