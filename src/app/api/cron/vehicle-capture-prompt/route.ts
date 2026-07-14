import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { businessDateString } from "@/lib/admin/fetchTodaySignals";
import { getFlowsByReservationId } from "@/lib/line/flow/flowStore";
import { promptVehicleCaptureIfNeeded, FLOW_PURPOSE_KEY } from "@/lib/ai/automation/vehicleCaptureAuto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 未登録車両の入庫日 車検証撮影プロンプト Cron
 * ---------------------------------------------
 * 毎朝、本日 (JST) 入庫予定で車両未登録の予約のうち、LINE 会話フロー経由で
 * 確定したもの (line_conversation_flows に reservation_id で紐づく「元」フローが
 * closed で存在する = 撮影用の側フローではない) について、
 * `promptVehicleCaptureIfNeeded` (opt-in + fail-soft) を呼び車検証撮影を依頼する。
 *
 * LINE 経由の予約かどうかは reservations 側に印が無いため、
 * line_conversation_flows を reservation_id で逆引きして判定する
 * (手動作成の予約を誤って LINE 未連携の顧客に送らないためのガード)。
 *
 * ponytail: 全 is_active テナントを直列処理する。daily-digest と同規模想定のため
 *   maxDuration=300 で十分。それを超える規模になったら QStash でテナント分割
 *   fan-out に切り替える。
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.authorized) return apiUnauthorized(auth.error ?? "unauthorized");

  try {
    const admin = createServiceRoleAdmin("cron vehicle-capture-prompt — 入庫日の車検証撮影依頼");

    const locked = await withCronLock(admin, "vehicle-capture-prompt", 600, async () => {
      const todayStr = businessDateString(new Date());

      const { data: tenants, error: tErr } = await admin
        .from("tenants")
        .select("id")
        .eq("is_active", true)
        .returns<{ id: string }[]>();
      if (tErr) throw new Error(`tenants query failed: ${tErr.message}`);

      let prompted = 0;
      let skipped = 0;
      let failed = 0;

      for (const tenant of tenants ?? []) {
        try {
          const { data: reservations, error: rErr } = await admin
            .from("reservations")
            .select("id, customer_id")
            .eq("tenant_id", tenant.id)
            .eq("scheduled_date", todayStr)
            .eq("status", "confirmed")
            .is("vehicle_id", null)
            .returns<{ id: string; customer_id: string | null }[]>();
          if (rErr) throw new Error(rErr.message);

          for (const reservation of reservations ?? []) {
            const flows = await getFlowsByReservationId(admin, tenant.id, reservation.id);
            // 元の商談フローは purpose マーカーを持たない (vehicle_capture 等の側フロー
            // だけが付ける) — 将来 Phase4/5 が別の purpose を持つ側フローを追加しても
            // 「マーカー無し = 元フロー」の判定は変わらず正しく成立する (既知の purpose
            // 値を都度列挙する除外方式より前方互換)。
            const fromLineFlow = flows.some((f) => f.state === "closed" && !f.context_json[FLOW_PURPOSE_KEY]);
            if (!fromLineFlow) {
              skipped++;
              continue;
            }
            const sent = await promptVehicleCaptureIfNeeded(admin, tenant.id, reservation, flows);
            if (sent) prompted++;
            else skipped++;
          }
        } catch (e) {
          failed++;
          logger.warn("vehicle capture prompt failed", {
            tenantId: tenant.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return { date: todayStr, tenants: (tenants ?? []).length, prompted, skipped, failed };
    });

    if (!locked.acquired) {
      return apiJson({ ok: true, skipped: "lock_not_acquired" });
    }
    return apiJson({ ok: true, ...locked.value });
  } catch (e) {
    return apiInternalError(e, "cron vehicle-capture-prompt");
  }
}
