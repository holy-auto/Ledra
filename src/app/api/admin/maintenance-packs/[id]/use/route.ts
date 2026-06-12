import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiError,
  apiInternalError,
} from "@/lib/api/response";
import { maintenancePackUseSchema } from "@/lib/validations/maintenance-pack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/maintenance-packs/[id]/use
 *
 * チケットを 1 枚消費する。
 *  1. パックを取得し、active かつ残チケットがあることを検証
 *  2. used_tickets を +1 し、total に達したら status='exhausted' に遷移
 *     （used_tickets の現在値を WHERE 条件に含めた compare-and-set で
 *      二重クリック等の競合による超過消費を防ぐ。DB の used_le_total
 *      CHECK 制約が最終防壁）
 *  3. maintenance_pack_usages に利用履歴を 1 行追加
 *
 * Postgres トランザクション (BEGIN/COMMIT) は supabase-js から直接張れない
 * ため、楽観的 compare-and-set + 補償ロールバック (使用行 INSERT 失敗時に
 * used_tickets を戻す) で整合性を担保する。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("pack id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = maintenancePackUseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { reservation_id, notes } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) パック取得 (テナントスコープ)
    const { data: pack, error: fetchErr } = await admin
      .from("maintenance_packs")
      .select("id, status, total_tickets, used_tickets")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "maintenance-packs use fetch");
    if (!pack) return apiNotFound("対象のメンテパックが見つかりません。");

    if (pack.status === "cancelled") {
      return apiValidationError("キャンセル済みのパックは使用できません。");
    }
    if (pack.status === "expired") {
      return apiValidationError("期限切れのパックは使用できません。");
    }
    if (pack.used_tickets >= pack.total_tickets) {
      return apiValidationError("チケットを使い切っています。");
    }

    // 2) reservation_id が指定されていれば自テナント所属を検証
    if (reservation_id) {
      const { data: resv, error: resvErr } = await admin
        .from("reservations")
        .select("id")
        .eq("id", reservation_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (resvErr) return apiInternalError(resvErr, "maintenance-packs use reservation check");
      if (!resv) return apiValidationError("指定された予約が見つかりません。");
    }

    const nextUsed = pack.used_tickets + 1;
    const nextStatus = nextUsed >= pack.total_tickets ? "exhausted" : pack.status;

    // 3) compare-and-set: used_tickets が読み取った値と一致するときだけ更新。
    //    並行リクエストが先に +1 していると 0 行ヒットになり、競合として弾く。
    const { data: updated, error: updErr } = await admin
      .from("maintenance_packs")
      .update({
        used_tickets: nextUsed,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("used_tickets", pack.used_tickets)
      .select("id, total_tickets, used_tickets, status")
      .maybeSingle();
    if (updErr) return apiInternalError(updErr, "maintenance-packs use update");
    if (!updated) {
      // 別リクエストが同時に消費した → 楽観ロック衝突
      return apiError({
        code: "conflict",
        message: "他の操作と競合しました。最新の状態を確認して再度お試しください。",
        status: 409,
      });
    }

    // 4) 利用履歴を追加。失敗時は used_tickets / status を補償ロールバック。
    const { data: usage, error: usageErr } = await admin
      .from("maintenance_pack_usages")
      .insert({
        pack_id: id,
        tenant_id: caller.tenantId,
        reservation_id: reservation_id,
        notes: notes,
      })
      .select("id, pack_id, reservation_id, notes, used_at")
      .single();
    if (usageErr) {
      await admin
        .from("maintenance_packs")
        .update({
          used_tickets: pack.used_tickets,
          status: pack.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .eq("used_tickets", nextUsed);
      return apiInternalError(usageErr, "maintenance-pack-usages insert");
    }

    return apiJson({
      ok: true,
      pack: updated,
      usage,
      remaining: updated.total_tickets - updated.used_tickets,
    });
  } catch (e) {
    return apiInternalError(e, "maintenance-packs use POST");
  }
}
