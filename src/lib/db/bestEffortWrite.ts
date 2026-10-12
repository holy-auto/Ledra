import { logger } from "@/lib/logger";

/**
 * 「落ちても本処理は続ける」DB 書き込みを、**黙らせずに**実行する。
 *
 * ## なぜ要るか
 *
 * Supabase の書き込みは失敗を例外ではなく `{ error }` で返す。だから
 * `await admin.from("x").insert(...)` と書くと、**失敗が誰にも届かない**。
 * 2026-10-10 にヒアリング連携で実害が出た（画面には「成功」、DB には何も無い。
 * DECISION_LOG 2026-10-10 / MISTAKE_LEDGER
 * `M-20261010-showed-success-while-dropping-three-db-errors`）。
 * 同じ形は `src/` 全体に **276 件**あった（実測 2026-10-10）。
 *
 * そのうち本当に「落ちても続けたい」書き込み —— 監査ログ・通知の記録・
 * キャッシュ・同期の進捗・補償処理 —— は、エラーを返す先が無い。
 * だが**黙って捨ててよい理由にはならない**。この関数は失敗をログに出す。
 *
 * ## 使うのはどちらか
 *
 * - 失敗が**利用者の操作の成否を変える**（その操作が実際には起きていない）
 *   → この関数を使わない。`{ error }` を受け取って API のエラーを返す／throw する。
 * - 失敗しても**利用者の操作は完了している**（記録・通知・後片付け）
 *   → この関数。第2引数に「何の書き込みか」を書く。ログを見た人が場所を特定できる粒度で。
 *
 * ## 例
 *
 * ```ts
 * await bestEffortWrite(
 *   admin.from("signature_audit_logs").insert({ session_id, event: "signed" }),
 *   "signature_audit_logs insert (signed)",
 *   { session_id },
 * );
 * ```
 *
 * @returns 成功したら true。分岐したい呼び出し元のためだけに返す（無視してよい）。
 */
export async function bestEffortWrite(
  op: PromiseLike<{ error: unknown }>,
  reason: string,
  context?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await op;
    if (!error) return true;
    logger.error(`best-effort の書き込みが失敗: ${reason}`, error, context);
    return false;
  } catch (e) {
    // ネットワーク断などで builder 自体が throw した場合。本処理は止めない。
    logger.error(`best-effort の書き込みが例外になった: ${reason}`, e, context);
    return false;
  }
}
