/**
 * 予約の状態変更ヘルパー (service-role)。管理APIのキャンセルは現状 route.ts に
 * インラインだが、LINE 会話フロー等の auth セッションを持たない経路から再利用できる
 * 共有ロジックをここに置く。webhook / fire-and-forget から呼ばれるため fail-soft
 * (throw せず結果で返す)。
 *
 * ponytail: 当初は `src/app/api/admin/reservations/route.ts` の DELETE/PUT も本ヘルパーへ
 * 寄せて単一情報源化する想定だったが、精査の結果まとめない。理由は認可モデルが異なるため:
 * 管理ルートは呼び出し元の RLS セッション + RBAC で「テナント内の任意の予約」を対象に
 * (所有者ガードなしで) 操作し、更新項目も多い (status/日時/parts/完了フック等)。一方この
 * ヘルパーは service-role + `customer_id` 所有者ガードが必須 (セルフ操作の要)。両者を統合すると
 * 管理ルートの RLS 防御を弱めるか、ヘルパーにモードフラグを足して肥大化させるかになり、
 * どちらも clarity/security を損なう。gcal 同期・キャンセル/変更の「意味」は共通だが、
 * 実装は別のまま保つのが正しい (共通化は net-negative)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { syncDeleteEvent, syncUpdateEvent } from "@/lib/gcal/client";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export type CancelReservationResult =
  | { ok: true; alreadyFinal: boolean }
  | { ok: false; reason: "not_found" | "wrong_customer" | "too_late" | "update_failed" };

interface CancelReservationInput {
  tenantId: string;
  reservationId: string;
  /** 対象予約の所有顧客。他人の予約を消さないための必須ガード。 */
  customerId: string;
  reason?: string;
  /**
   * 締め切り (JST 日付, YYYY-MM-DD)。指定時、対象予約の scheduled_date がこれ以下 (当日・過去)
   * なら too_late で拒否する。「前日まで」= 提示時のスナップショットではなく確定直前の実 DB 値で
   * 検証するためのガード (提示後にスタッフが当日へ日程変更した場合も安全)。
   */
  cutoffDate?: string;
}

/**
 * 予約を「キャンセル」する (status=cancelled + cancelled_at + cancel_reason、gcal イベント削除)。
 * tenant_id + customer_id の一致を検証し、他顧客の予約は拒否する。既に cancelled/completed の
 * 場合は冪等に成功扱い (alreadyFinal:true) で二重処理しない。cutoffDate 指定時は締め切りも検証。
 * 失敗しても投げない。
 */
export async function cancelReservationById(
  admin: Admin,
  input: CancelReservationInput,
): Promise<CancelReservationResult> {
  const { tenantId, reservationId, customerId } = input;
  try {
    const { data: existing } = await admin
      .from("reservations")
      .select("id, tenant_id, customer_id, status, scheduled_date, gcal_event_id")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const row = existing as {
      id: string;
      tenant_id: string;
      customer_id: string | null;
      status: string | null;
      scheduled_date: string | null;
      gcal_event_id: string | null;
    } | null;

    if (!row) return { ok: false, reason: "not_found" };
    // 所有者ガード: 別顧客 (または顧客未紐付け) の予約はセルフ操作で消させない。
    if (row.customer_id !== customerId) return { ok: false, reason: "wrong_customer" };
    // 既に終端 (cancelled / completed) なら何もしない (冪等)。
    if (row.status === "cancelled" || row.status === "completed") return { ok: true, alreadyFinal: true };
    // 締め切り (前日まで) を実 DB 値で再検証。提示後に当日入り・日程変更されていたら拒否。
    if (input.cutoffDate && (!row.scheduled_date || row.scheduled_date <= input.cutoffDate)) {
      return { ok: false, reason: "too_late" };
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
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
      .not("status", "in", "(cancelled,completed)")
      // RETURNING で実際に更新できた行を受け取り、0 行 (直前に終端化) を成功と誤認しない。
      .select("id");
    if (error) {
      logger.warn("[reservations.mutate] cancel update failed", { tenantId, reservationId, err: error.message });
      return { ok: false, reason: "update_failed" };
    }
    // ガードにより 0 行なら、SELECT〜UPDATE の間に他経路で終端化された = 冪等な no-op。
    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
      return { ok: true, alreadyFinal: true };
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

export type RescheduleReservationResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "wrong_customer" | "not_reschedulable" | "too_late" | "update_failed" };

interface RescheduleReservationInput {
  tenantId: string;
  reservationId: string;
  /** 対象予約の所有顧客。他人の予約を動かさないための必須ガード。 */
  customerId: string;
  /** 変更後の日程 (YYYY-MM-DD)。 */
  newDate: string;
  /** 変更後の開始時刻 (HH:MM:SS)。 */
  newStartTime: string;
  /** 変更後の終了時刻 (HH:MM:SS)。 */
  newEndTime: string;
  /**
   * 締め切り (JST 日付, YYYY-MM-DD)。指定時、**現在の** scheduled_date がこれ以下 (当日・過去)
   * なら too_late で拒否する (「前日まで」= 提示時のスナップショットではなく確定直前の実 DB 値で検証)。
   */
  cutoffDate?: string;
}

/**
 * 予約の日程を変更する (scheduled_date / start_time / end_time を更新し gcal イベントも更新)。
 * tenant_id + customer_id の一致を検証し、他顧客の予約は拒否する。既に cancelled/completed の
 * 予約は変更しない (not_reschedulable)。cutoffDate 指定時は締め切りも検証。失敗しても投げない。
 */
export async function rescheduleReservationById(
  admin: Admin,
  input: RescheduleReservationInput,
): Promise<RescheduleReservationResult> {
  const { tenantId, reservationId, customerId, newDate, newStartTime, newEndTime } = input;
  try {
    const { data: existing } = await admin
      .from("reservations")
      .select("id, tenant_id, customer_id, status, scheduled_date, title, gcal_event_id")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const row = existing as {
      id: string;
      tenant_id: string;
      customer_id: string | null;
      status: string | null;
      scheduled_date: string | null;
      title: string | null;
      gcal_event_id: string | null;
    } | null;

    if (!row) return { ok: false, reason: "not_found" };
    // 所有者ガード: 別顧客 (または顧客未紐付け) の予約はセルフ操作で動かさせない。
    if (row.customer_id !== customerId) return { ok: false, reason: "wrong_customer" };
    // 終端 (cancelled / completed) は変更対象にしない。
    if (row.status === "cancelled" || row.status === "completed") return { ok: false, reason: "not_reschedulable" };
    // 締め切り (前日まで) を実 DB 値で再検証。提示後に当日入り・日程変更されていたら拒否。
    if (input.cutoffDate && (!row.scheduled_date || row.scheduled_date <= input.cutoffDate)) {
      return { ok: false, reason: "too_late" };
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("reservations")
      .update({
        scheduled_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        updated_at: now,
      })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      // 直前に他経路で終端化されていたら日程だけ動かさない (楽観的ガード)。
      .not("status", "in", "(cancelled,completed)")
      // RETURNING で実際に更新できた行を受け取り、0 行 (直前に終端化) を成功と誤認しない。
      .select("id");
    if (error) {
      logger.warn("[reservations.mutate] reschedule update failed", { tenantId, reservationId, err: error.message });
      return { ok: false, reason: "update_failed" };
    }
    // ガードにより 0 行なら、SELECT〜UPDATE の間に他経路で終端化された = 変更成立せず。
    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
      return { ok: false, reason: "not_reschedulable" };
    }

    // Google カレンダー同期 (非ブロッキング / それ自体が fail-soft)。日程変更は成立させ、
    // gcal 側の失敗は握りつぶす (route.ts PUT と同じ扱い)。
    if (row.gcal_event_id) {
      await syncUpdateEvent(tenantId, {
        id: reservationId,
        title: row.title ?? "ご予約",
        scheduled_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        gcal_event_id: row.gcal_event_id,
      }).catch((e) =>
        logger.warn("[reservations.mutate] gcal update failed (non-blocking)", {
          tenantId,
          reservationId,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    return { ok: true };
  } catch (e) {
    logger.warn("[reservations.mutate] rescheduleReservationById threw", {
      tenantId,
      reservationId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "update_failed" };
  }
}
