/**
 * LINE ユーザー × 顧客の「紐づけ」を 1 箇所に集約するヘルパ。
 *
 * 紐づけが成立する経路は複数ある:
 *   1. 受信箱からスタッフが手動で紐づけ (`/api/admin/messages/[key]/link`)
 *   2. 顧客が連携コードを LINE 送信 (`tryConsumeLineLinkCode`)
 *   3. 新規顧客の登録フォーム (intake) 完了 (`submitAndProcessIntake` / `approveIntake`)
 *
 * いずれの経路でも「紐づけ完了時にやるべきこと」は同じなので、ここに集約する:
 *   a. customers.line_user_id をセット (未設定 / 同一のときのみ)
 *   b. 同じ line_user_id を持つ customer_id=NULL の customer_messages を backfill
 *      (友だち追加直後など未紐づけで溜まっていた過去スレッドを顧客に集約)
 *   c. 過去のやり取りを AI 解析して予約候補化する一括取り込みジョブを enqueue
 *      (fire-and-forget。opt-in テナントのみ実体が動く)
 *
 * webhook / 自動経路には auth セッションが無いため service-role で書き込む。
 * tenant_id は呼び出し元から厳密に渡される値のみを使う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { enqueueLineHistoryImport } from "@/lib/qstash/publish";

export interface LinkLineUserResult {
  ok: boolean;
  /** backfill された (customer_id を埋めた) メッセージ件数。 */
  backfilled: number;
}

/**
 * line_user_id を顧客に紐づけ、過去メッセージを backfill し、履歴取り込みを enqueue する。
 *
 * @param setLineUserId customers.line_user_id を更新するか (既定 true)。受信箱の link
 *   ルートのように呼び出し側で既に更新済みの場合は false を渡して二重更新を避ける。
 */
export async function linkLineUserToCustomer(params: {
  tenantId: string;
  customerId: string;
  lineUserId: string;
  setLineUserId?: boolean;
}): Promise<LinkLineUserResult> {
  const { tenantId, customerId, lineUserId } = params;
  const setLineUserId = params.setLineUserId !== false;

  const admin = createServiceRoleAdmin(
    "LINE 顧客紐づけ — line_user_id セット + 過去メッセージ backfill (webhook / intake は auth セッション無し)",
  );

  // a. customers.line_user_id をセット (まだ別ユーザーが付いていない場合のみ)。
  if (setLineUserId) {
    const { error: upErr } = await admin
      .from("customers")
      .update({ line_user_id: lineUserId, updated_at: new Date().toISOString() })
      .eq("id", customerId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[linkCustomer] set line_user_id failed", { tenantId, customerId, err: upErr.message });
      return { ok: false, backfilled: 0 };
    }
  }

  // b. 未紐づけメッセージを backfill。
  let backfilled = 0;
  try {
    const { error: bfErr, count } = await admin
      .from("customer_messages")
      .update({ customer_id: customerId }, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .is("customer_id", null);
    if (bfErr) {
      logger.warn("[linkCustomer] backfill failed", { tenantId, customerId, err: bfErr.message });
    } else {
      backfilled = count ?? 0;
    }
  } catch (e) {
    logger.warn("[linkCustomer] backfill threw", {
      tenantId,
      customerId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // c. 履歴一括取り込みを enqueue (fire-and-forget)。opt-in テナントのみジョブ側で実体が動く。
  try {
    await enqueueLineHistoryImport({ tenant_id: tenantId, customer_id: customerId, line_user_id: lineUserId });
  } catch (e) {
    logger.warn("[linkCustomer] enqueue history import failed", {
      tenantId,
      customerId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: true, backfilled };
}
