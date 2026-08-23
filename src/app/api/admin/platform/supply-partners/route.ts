/**
 * 運営専用: 供給パートナー(卸元/メーカー)の審査・信頼管理。
 *
 * - GET:  全供給パートナーを運営ビューで一覧 (内部列含む。鍵そのものは読まない)。
 * - POST: 任意の信頼バッジ is_trusted を付与/解除する (auto-send のゲートには使わない。
 *         auto-send は店舗の opt-in + 金額上限 + API/ポータル連携で制御される)。
 *
 * セキュリティ:
 *   - isPlatformAdmin ゲート (super_admin もしくは運営テナントの owner/admin)。
 *   - is_trusted は DB トリガ supply_partners_guard_protected_cols が
 *     非 service-role の変更を差し戻すため、ここは createPlatformScopedAdmin
 *     (service-role) で更新する = 運営だけが付与できる正規経路。
 *   - 操作は admin_audit_logs に記録する。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 運営ビューの列 (api鍵・notes は読まない)。
const OPS_COLS =
  "id, name, contact_email, contact_phone, status, integration_status, is_trusted, agent_id, api_endpoint, api_auth_type, last_order_at, created_at";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin(
      "admin/platform/supply-partners: 運営による供給パートナーの審査・信頼付与の一覧 (内部列・platform スコープ)",
    );
    const { data: partners, error } = await admin
      .from("supply_partners")
      .select(OPS_COLS)
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "platform supply-partners list");

    // 鍵が設定済みかどうかの真偽のみ (鍵そのものは読まない)。
    const ids = (partners ?? []).map((p) => p.id as string);
    const credSet = new Set<string>();
    if (ids.length > 0) {
      const { data: creds } = await admin
        .from("supply_partner_credentials")
        .select("supply_partner_id, api_key_ciphertext")
        .in("supply_partner_id", ids);
      for (const c of creds ?? []) {
        if (c.api_key_ciphertext) credSet.add(c.supply_partner_id as string);
      }
    }

    const result = (partners ?? []).map((p) => ({
      ...p,
      credentials_configured: credSet.has(p.id as string),
    }));
    return apiJson({ ok: true, partners: result });
  } catch (e: unknown) {
    return apiInternalError(e, "platform supply-partners GET");
  }
}

const trustSchema = z.object({
  supply_partner_id: z.string().uuid("無効なパートナーIDです。"),
  is_trusted: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = trustSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { supply_partner_id, is_trusted } = parsed.data;

    const admin = createPlatformScopedAdmin(
      "admin/platform/supply-partners: 運営による is_trusted (任意の信頼バッジ) の付与/解除",
    );

    const { data: partner, error: pErr } = await admin
      .from("supply_partners")
      .select("id, name, is_trusted")
      .eq("id", supply_partner_id)
      .single();
    if (pErr || !partner) return apiNotFound("供給パートナーが見つかりません。");

    const { error: uErr } = await admin.from("supply_partners").update({ is_trusted }).eq("id", supply_partner_id);
    if (uErr) return apiInternalError(uErr, "platform supply-partners trust update");

    // 監査ログ (失敗してもアクションは止めない)。
    try {
      // actor_tenant_id 列は admin_audit_logs に存在しないため meta に格納する
      await admin.from("admin_audit_logs").insert({
        actor_id: caller.userId,
        action: is_trusted ? "platform.supply_partner.trust" : "platform.supply_partner.untrust",
        target_type: "supply_partner",
        target_id: supply_partner_id,
        meta: { actor_tenant_id: caller.tenantId, partner_name: partner.name, is_trusted },
      });
    } catch (auditErr) {
      console.error("[platform/supply-partners] audit log failed:", auditErr);
    }

    return apiJson({
      ok: true,
      supply_partner_id,
      is_trusted,
      message: `${partner.name} を${is_trusted ? "信頼パートナーに設定" : "信頼解除"}しました。`,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "platform supply-partners POST");
  }
}
