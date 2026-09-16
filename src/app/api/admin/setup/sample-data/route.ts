import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * サンプルデータ管理 API
 * --------------------
 * 新規ユーザーが本番運用前に Ledra を試せるよう、サンプル顧客・車両を生成する。
 * `note` / `notes` の先頭に [SAMPLE] マーカーを付けて識別可能にし、
 * DELETE で一括クリーンアップできる。
 */

const SAMPLE_MARKER = "[SAMPLE]";
const SAMPLE_NOTE =
  "[SAMPLE] サンプルデータです。試した後、ダッシュボードのセットアップカードからまとめて削除できます。";

export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const [{ count: customerCount }, { count: vehicleCount }] = await Promise.all([
        admin
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .ilike("note", `${SAMPLE_MARKER}%`),
        admin
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .ilike("notes", `${SAMPLE_MARKER}%`),
      ]);

      return apiJson({
        ok: true,
        sample_count: (customerCount ?? 0) + (vehicleCount ?? 0),
        customer_count: customerCount ?? 0,
        vehicle_count: vehicleCount ?? 0,
      });
    } catch (e) {
      return apiInternalError(e, "setup/sample-data:GET");
    }
  },
  { routeName: "setup/sample-data:GET" },
);

export const POST = withCaller(
  async (_req, { caller }) => {
    try {
      // サンプルデータの生成・一括削除は admin 以上 (代表判断 2026-09-01)

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { data: existing } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", caller.tenantId)
        .ilike("note", `${SAMPLE_MARKER}%`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return apiJson({ ok: true, already_exists: true });
      }

      const { data: customer, error: custErr } = await admin
        .from("customers")
        .insert({
          tenant_id: caller.tenantId,
          name: "サンプル太郎",
          name_kana: "サンプル タロウ",
          email: "sample@example.com",
          phone: "090-0000-0000",
          postal_code: "100-0001",
          address: "東京都千代田区千代田 1-1",
          note: SAMPLE_NOTE,
        })
        .select("id")
        .single();
      if (custErr || !customer) {
        return apiInternalError(custErr, "setup/sample-data:POST customer");
      }

      const { data: vehicle, error: vehErr } = await admin
        .from("vehicles")
        .insert({
          tenant_id: caller.tenantId,
          customer_id: customer.id,
          maker: "トヨタ",
          model: "プリウス",
          year: 2023,
          plate_display: "品川 300 さ 12-34",
          vin_code: "SAMPLE0000000001",
          size_class: "M",
          notes: SAMPLE_NOTE,
        })
        .select("id")
        .single();
      if (vehErr) {
        // 車両作成失敗時は顧客もロールバック
        await admin.from("customers").delete().eq("id", customer.id);
        return apiInternalError(vehErr, "setup/sample-data:POST vehicle");
      }

      return apiJson({
        ok: true,
        customer_id: customer.id,
        vehicle_id: vehicle?.id ?? null,
      });
    } catch (e) {
      return apiInternalError(e, "setup/sample-data:POST");
    }
  },
  { permission: "settings:edit", routeName: "setup/sample-data:POST" },
);

export const DELETE = withCaller(
  async (_req, { caller }) => {
    try {
      // サンプルデータの生成・一括削除は admin 以上 (代表判断 2026-09-01)

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // 順序: 車両 → 顧客 (FK 整合のため車両を先に)
      const { error: vehErr, count: vehDeleted } = await admin
        .from("vehicles")
        .delete({ count: "exact" })
        .eq("tenant_id", caller.tenantId)
        .ilike("notes", `${SAMPLE_MARKER}%`);
      if (vehErr) {
        logger.warn("setup/sample-data:DELETE vehicles failed", { err: vehErr.message });
      }

      const { error: custErr, count: custDeleted } = await admin
        .from("customers")
        .delete({ count: "exact" })
        .eq("tenant_id", caller.tenantId)
        .ilike("note", `${SAMPLE_MARKER}%`);
      if (custErr) {
        logger.warn("setup/sample-data:DELETE customers failed", { err: custErr.message });
      }

      return apiJson({
        ok: true,
        deleted: (vehDeleted ?? 0) + (custDeleted ?? 0),
      });
    } catch (e) {
      return apiInternalError(e, "setup/sample-data:DELETE");
    }
  },
  { permission: "settings:edit", routeName: "setup/sample-data:DELETE" },
);

// External use
export const SAMPLE_NOTE_MARKER = SAMPLE_MARKER;
