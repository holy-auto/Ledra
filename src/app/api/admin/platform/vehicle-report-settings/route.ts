/**
 * 運営専用: 車両全履歴レポートの価格設定 (プラットフォーム共通)
 *
 * パスポート履歴はテナント横断のため、価格は単一のプラットフォーム
 * 設定 (vehicle_report_settings の単一行) として管理する。
 */

import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { DEFAULT_REPORT_PRICE_JPY } from "@/lib/vehicleReport/access";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  price_jpy: z.coerce.number().int().min(100).max(1000000),
  enabled: z.boolean().optional(),
});

export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin("vehicle report settings — read platform-wide pricing");
      const { data } = await admin.from("vehicle_report_settings").select("price_jpy, enabled").eq("id", 1).maybeSingle();

      const row = data as { price_jpy: number | null; enabled: boolean | null } | null;
      return apiJson({
        price_jpy: row?.price_jpy ?? DEFAULT_REPORT_PRICE_JPY,
        enabled: row?.enabled ?? true,
      });
    } catch (e) {
      return apiInternalError(e, "vehicle-report-settings GET");
    }
  },
  { routeName: "vehicle-report-settings GET" },
);

export const PUT = withCaller(
  async (req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const admin = createPlatformScopedAdmin("vehicle report settings — update platform-wide pricing");
      const { error } = await admin.from("vehicle_report_settings").upsert(
        {
          id: 1,
          price_jpy: parsed.data.price_jpy,
          enabled: parsed.data.enabled ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) return apiInternalError(error, "vehicle_report_settings upsert");

      return apiJson({ ok: true, price_jpy: parsed.data.price_jpy, enabled: parsed.data.enabled ?? true });
    } catch (e) {
      return apiInternalError(e, "vehicle-report-settings PUT");
    }
  },
  { routeName: "vehicle-report-settings PUT" },
);
