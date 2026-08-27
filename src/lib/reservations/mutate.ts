/**
 * 予約の状態変更ヘルパー (service-role)。管理APIのキャンセルは現状 route.ts に
 * インラインだが、LINE 会話フロー等の auth セッションを持たない経路から再利用できる
 * 共有ロジックをここに置く。webhook / fire-and-forget から呼ばれるため fail-soft
 * (throw せず結果で返す)。
 *
 * ponytail: いずれ `src/app/api/admin/reservations/route.ts` の DELETE/PUT も本ヘルパーに
 * 寄せて単一情報源化できる。現状は blast radius を抑えて admin ルートは据え置き。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { syncDeleteEvent } from "@/lib/gcal/client";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export type CancelReservationResult =
  { ok: true; alreadyFinal: boolean } | { ok: false; reason: "not_found" | "wrong_customer" | "update_failed" };

interface CancelReservationInput {
  tenantId: string;
  reservationId: string;
  /** 対象予約の所有顧客。他人の予約を消さないための必須ガード。 */
  customerId: string;
  reason?: string;
}

/**
 * 予約を「キャンセル」する (status=cancelled + cancelled_at + cancel_reason、gcal イベント削除)。
 * tenant_id + customer_id の一致を検証し、他顧客の予約は拒否する。既に cancelled/completed の
 * 場合は冪等に成功扱い (alreadyFinal:true) で二重処理しない。失敗しても投げない。
 */
export async function cancelReservationById(
  admin: Admin,
  input: CancelReservationInput,
): Promise<CancelReservationResult> {
  const { tenantId, reservationId, customerId } = input;
  try {
    const { data: existing } = await admin
      .from("reservations")
      .select("id, tenant_id, customer_id, status, gcal_event_id")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const row = existing as {
      id: string;
      tenant_id: string;
      customer_id: string | null;
      status: string | null;
      gcal_event_id: string | null;
    } | null;

    if (!row) return { ok: false, reason: "not_found" };
    // 所有者ガード: 別顧客 (または顧客未紐付け) の予約はセルフ操作で消させない。
    if (row.customer_id !== customerId) return { ok: false, reason: "wrong_customer" };
    // 既に終端 (cancelled / completed) なら何もしない (冪等)。
    if (row.status === "cancelled" || row.status === "completed") return { ok: true, alreadyFinal: true };

    const now = new Date().toISOString();
    const { error } = await admin
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancel_reason: input.reason ?? "顧客がLINEでキャンセル",
        updated_at: now,
      })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      // 直前に他経路で終端化されていたら上書きしない (楽観的ガード)。
      .not("status", "in", "(cancelled,completed)");
    if (error) {
      logger.warn("[reservations.mutate] cancel update failed", { tenantId, reservationId, err: error.message });
      return { ok: false, reason: "update_failed" };
    }

    // Google カレンダー同期 (非ブロッキング / それ自体が fail-soft)。予約自体の
    // キャンセルは成立させ、gcal 側の失敗は握りつぶす (route.ts DELETE と同じ扱い)。
    if (row.gcal_event_id) {
      await syncDeleteEvent(tenantId, reservationId, row.gcal_event_id).catch((e) =>
        logger.warn("[reservations.mutate] gcal delete failed (non-blocking)", {
          tenantId,
          reservationId,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    return { ok: true, alreadyFinal: false };
  } catch (e) {
    logger.warn("[reservations.mutate] cancelReservationById threw", {
      tenantId,
      reservationId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "update_failed" };
  }
}
