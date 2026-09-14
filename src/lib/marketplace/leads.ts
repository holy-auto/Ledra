/**
 * 中古車市場連携: lead tracking + claim 計算。
 *
 * Phase D #1: partner が VIN を照会するたびに lead 行を作り、後日
 * 「成約した」と claim してきたら attributed tenant に referral fee を
 * 配分する根拠を残す。
 *
 * 認可:
 *   - lead 作成: passport_api_keys (scope: passport:marketplace) で認証された consumer
 *   - claim: lead_token を持つ partner のみ
 *   - 閲覧: tenant_memberships 経由 (RLS) または service-role
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// 紹介手数料率: 売却額の N%。テナント単位の override は将来。
// MVP では固定で 0.5% (= 100万円なら 5,000 円)。
const DEFAULT_REFERRAL_FEE_RATE = 0.005;

const TOKEN_PREFIX = "lrf_";

export function generateLeadToken(): string {
  const random = crypto.randomBytes(24).toString("base64url");
  return `${TOKEN_PREFIX}${random}`;
}

export function isLeadTokenFormat(value: string): boolean {
  return typeof value === "string" && value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 20;
}

type AdminLike = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type CreateLeadResult =
  { ok: true; leadId: string; leadToken: string; attributedTenantIds: string[] } | { ok: false; error: string };

/**
 * partner が VIN を照会した時に呼ばれる。
 *
 * 同じ partner + 同じ VIN で短期間に複数回照会された場合は
 * 既存の queried レコードを返す (重複 lead を避ける)。
 */
export async function createOrReuseLead(args: {
  admin: AdminLike;
  consumerId: string;
  apiKeyId: string | null;
  vinNormalized: string;
}): Promise<CreateLeadResult> {
  // 既存の queried lead を 7 日以内に限定して再利用
  const reuseSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingRaw } = await args.admin
    .from("passport_referral_leads")
    .select("id, lead_token, attributed_tenant_ids")
    .eq("consumer_id", args.consumerId)
    .eq("vin_code_normalized", args.vinNormalized)
    .eq("status", "queried")
    .gte("queried_at", reuseSince)
    .order("queried_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = existingRaw as { id: string; lead_token: string; attributed_tenant_ids: string[] | null } | null;
  if (existing) {
    return {
      ok: true,
      leadId: existing.id,
      leadToken: existing.lead_token,
      attributedTenantIds: existing.attributed_tenant_ids ?? [],
    };
  }

  // 紐づく tenant_id 集合を passport から取得
  const tenantIds = await collectAttributedTenants(args.admin, args.vinNormalized);

  const leadToken = generateLeadToken();
  const { data: insertedRaw, error } = await args.admin
    .from("passport_referral_leads")
    .insert({
      vin_code_normalized: args.vinNormalized,
      consumer_id: args.consumerId,
      api_key_id: args.apiKeyId,
      lead_token: leadToken,
      attributed_tenant_ids: tenantIds,
    })
    .select("id")
    .single();

  if (error || !insertedRaw) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  return {
    ok: true,
    leadId: (insertedRaw as { id: string }).id,
    leadToken,
    attributedTenantIds: tenantIds,
  };
}

/** Passport を経由して VIN に紐づく全テナントを取り出す。 */
async function collectAttributedTenants(admin: AdminLike, vinNormalized: string): Promise<string[]> {
  const { data: vehiclesRaw } = await admin
    .from("vehicles")
    .select("tenant_id")
    .eq("vin_code_normalized", vinNormalized)
    .eq("passport_opt_out", false);
  const tenants = (vehiclesRaw ?? []) as Array<{ tenant_id: string }>;
  const unique = [...new Set(tenants.map((v) => v.tenant_id))];
  return unique;
}

export type ClaimResult =
  | {
      ok: true;
      leadId: string;
      referralFeeJpy: number;
      perTenantFeeJpy: Record<string, number>;
    }
  | {
      ok: false;
      reason: "not_found" | "not_pending" | "expired" | "invalid_amount" | "db_error";
      message: string;
    };

/**
 * partner が lead_token を使って成約を claim する。
 *
 * 同じ lead は 1 回しか claim できない (status='claimed' で固定)。
 */
export async function claimLead(args: {
  admin: AdminLike;
  consumerId: string;
  leadToken: string;
  saleAmountJpy: number;
  partnerReference?: string | null;
}): Promise<ClaimResult> {
  if (!Number.isInteger(args.saleAmountJpy) || args.saleAmountJpy < 0 || args.saleAmountJpy > 100_000_000) {
    return { ok: false, reason: "invalid_amount", message: "売却額の指定が不正です。" };
  }

  const { data: leadRaw } = await args.admin
    .from("passport_referral_leads")
    .select("id, consumer_id, status, expires_at, attributed_tenant_ids")
    .eq("lead_token", args.leadToken)
    .maybeSingle();
  const lead = leadRaw as {
    id: string;
    consumer_id: string;
    status: string;
    expires_at: string;
    attributed_tenant_ids: string[] | null;
  } | null;

  if (!lead) return { ok: false, reason: "not_found", message: "リードが見つかりません。" };
  if (lead.consumer_id !== args.consumerId) {
    // 他人の lead に対する claim は存在を漏らさず not_found
    return { ok: false, reason: "not_found", message: "リードが見つかりません。" };
  }
  if (lead.status !== "queried") {
    return { ok: false, reason: "not_pending", message: "このリードは既に処理済みです。" };
  }
  if (new Date(lead.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired", message: "このリードは期限切れです。" };
  }

  const referralFee = Math.round(args.saleAmountJpy * DEFAULT_REFERRAL_FEE_RATE);
  const tenantIds = lead.attributed_tenant_ids ?? [];
  const perTenantFee = computePerTenantSplit(referralFee, tenantIds);

  const { data: updatedRaw, error: updateErr } = await args.admin
    .from("passport_referral_leads")
    .update({
      status: "claimed",
      sale_amount_jpy: args.saleAmountJpy,
      referral_fee_jpy: referralFee,
      partner_reference: args.partnerReference ?? null,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq("status", "queried")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return { ok: false, reason: "db_error", message: "更新に失敗しました。" };
  }
  if (!updatedRaw) {
    // 競合で 0 件: 既に claimed
    return { ok: false, reason: "not_pending", message: "このリードは既に処理済みです。" };
  }

  return {
    ok: true,
    leadId: lead.id,
    referralFeeJpy: referralFee,
    perTenantFeeJpy: perTenantFee,
  };
}

/**
 * 紹介手数料を attributed テナントに等分する。
 *
 * 単純な均等割。複数テナントが施工していたケースは稀なので MVP は
 * これで十分。将来は「最終施工が多い店に多く配分」等の重みづけ可能。
 *
 * 端数は最後のテナントに寄せる (合計が referralFee に一致するよう保証)。
 */
export function computePerTenantSplit(referralFee: number, tenantIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (tenantIds.length === 0 || referralFee <= 0) return out;
  const base = Math.floor(referralFee / tenantIds.length);
  const remainder = referralFee - base * tenantIds.length;
  const lastIdx = tenantIds.length - 1;
  for (let i = 0; i < tenantIds.length; i++) {
    out[tenantIds[i]] = base + (i === lastIdx ? remainder : 0);
  }
  return out;
}
