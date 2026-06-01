/**
 * 供給パートナー (卸元/メーカー) の自己プロフィール + API 連携設定。
 *
 * - GET:  自分のパートナー情報 + 認証情報の「設定済みか」だけを返す (鍵そのものは返さない)。
 * - POST: 未登録ユーザーが自分を owner として新規登録する (必ず status=審査待ち)。
 * - PUT:  連絡先 / API エンドポイント / 認証方式 / API 鍵を更新する。
 *
 * セキュリティ:
 *   - status / agent_id は DB トリガ (supply_partners_guard_protected_cols) が
 *     owner からの変更を差し戻す。ここでも送信しない。
 *   - API 鍵は secretBox で暗号化し supply_partner_credentials に隔離保存
 *     (平文では保存も返却もしない)。レスポンスには credentials_configured (boolean) のみ。
 *   - RLS により owner 本人の行しか読み書きできない (service-role は使わない)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { resolveSupplyPartnerContext } from "@/lib/supply/partnerContext";
import { supplyRegisterSchema, supplyProfileUpdateSchema } from "@/lib/supply/validation";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";
import { hasEncryptionKey } from "@/lib/crypto/secretBox";
import { normalizeSupplyApiAuthType } from "@/types/supply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await resolveSupplyPartnerContext();
    if (!ctx) return apiJson({ ok: true, partner: null });

    const supabase = await createSupabaseServerClient();
    const { data: partner, error } = await supabase
      .from("supply_partners")
      .select(
        "id, name, contact_email, contact_phone, status, agent_id, api_endpoint, api_auth_type, integration_status, last_order_at, created_at",
      )
      .eq("id", ctx.partnerId)
      .maybeSingle();
    if (error) return apiInternalError(error, "supply profile get");
    if (!partner) return apiNotFound("partner not found");

    // 鍵そのものは返さず「設定済みか」だけを返す。
    const { data: cred } = await supabase
      .from("supply_partner_credentials")
      .select("api_key_ciphertext, api_secret_ciphertext")
      .eq("supply_partner_id", ctx.partnerId)
      .maybeSingle();
    const credentialsConfigured = Boolean(cred?.api_key_ciphertext || cred?.api_secret_ciphertext);

    return apiJson({ ok: true, partner, credentials_configured: credentialsConfigured });
  } catch (e: unknown) {
    return apiInternalError(e, "supply profile get");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    // 既に owner なら二重登録させない。
    const existing = await resolveSupplyPartnerContext();
    if (existing) return apiValidationError("既にパートナー登録済みです。");

    const parsed = await parseJsonBody(req, supplyRegisterSchema);
    if (!parsed.ok) return parsed.response;

    // status は DB 既定 (active_pending_review)。RLS の insert ポリシーが
    // owner_user_id = auth.uid() かつ status = 審査待ち を強制する。
    const { data, error } = await supabase
      .from("supply_partners")
      .insert({
        name: parsed.data.name,
        contact_email: parsed.data.contact_email ?? null,
        contact_phone: parsed.data.contact_phone ?? null,
        owner_user_id: auth.user.id,
        status: "active_pending_review",
      })
      .select("id")
      .single();
    if (error) return apiInternalError(error, "supply partner register");
    return apiJson({ ok: true, id: data.id });
  } catch (e: unknown) {
    return apiInternalError(e, "supply partner register");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await resolveSupplyPartnerContext();
    if (!ctx) return apiUnauthorized();

    const parsed = await parseJsonBody(req, supplyProfileUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;

    const supabase = await createSupabaseServerClient();

    // ── プロフィール / API 設定 (機密でない列) を更新 ──
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.contact_email !== undefined) updates.contact_email = input.contact_email;
    if (input.contact_phone !== undefined) updates.contact_phone = input.contact_phone;
    if (input.api_endpoint !== undefined) updates.api_endpoint = input.api_endpoint;
    if (input.api_auth_type !== undefined) updates.api_auth_type = input.api_auth_type;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("supply_partners").update(updates).eq("id", ctx.partnerId);
      if (error) return apiInternalError(error, "supply profile update");
    }

    // ── API 鍵 (機密) を別テーブルへ暗号化保存 ──
    const touchKey = input.api_key !== undefined;
    const touchSecret = input.api_secret !== undefined;
    if (touchKey || touchSecret) {
      if (!hasEncryptionKey()) {
        return apiInternalError(new Error("SECRET_ENCRYPTION_KEY not set"), "supply credentials update");
      }
      const credUpdate: Record<string, unknown> = { supply_partner_id: ctx.partnerId };
      if (touchKey) credUpdate.api_key_ciphertext = (await buildSecretWrite(input.api_key)).ciphertext;
      if (touchSecret) credUpdate.api_secret_ciphertext = (await buildSecretWrite(input.api_secret)).ciphertext;
      credUpdate.rotated_at = new Date().toISOString();

      // upsert (1 パートナー 1 行)。RLS が owner 本人に限定する。
      const { error: credErr } = await supabase
        .from("supply_partner_credentials")
        .upsert(credUpdate, { onConflict: "supply_partner_id" });
      if (credErr) return apiInternalError(credErr, "supply credentials update");
    }

    // 連携状態の自動更新: エンドポイント + 認証方式 + 鍵が揃えば connected 候補。
    // 実際の疎通確認 (verifyConnection) は Phase 2。ここでは設定有無のみ反映。
    if (touchKey || input.api_endpoint !== undefined || input.api_auth_type !== undefined) {
      const { data: p } = await supabase
        .from("supply_partners")
        .select("api_endpoint, api_auth_type")
        .eq("id", ctx.partnerId)
        .maybeSingle();
      const { data: c } = await supabase
        .from("supply_partner_credentials")
        .select("api_key_ciphertext")
        .eq("supply_partner_id", ctx.partnerId)
        .maybeSingle();
      const authType = normalizeSupplyApiAuthType(p?.api_auth_type as string | null);
      const configured = authType !== "none" && Boolean(p?.api_endpoint) && Boolean(c?.api_key_ciphertext);
      await supabase
        .from("supply_partners")
        .update({ integration_status: configured ? "connected" : "unconfigured" })
        .eq("id", ctx.partnerId);
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supply profile update");
  }
}
