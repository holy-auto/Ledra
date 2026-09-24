/**
 * `insurer_access_logs.action` の正準語彙と、そこへ1行書くための唯一の入口。
 *
 * なぜこのファイルが要るか
 * ------------------------
 * この語彙は 2026-09-23 まで DB の CHECK 制約にしか書かれておらず、書き手は
 * TypeScript の直 insert・`insurer_audit_log` RPC・SQL 関数の3経路に散らばっていた。
 * CHECK が4値しか許していないのに、コードは 20 種を書いていた。結果、保険会社
 * ポータルの車両検索・店舗検索・車両詳細が本番で必ず 500（SQL 関数の中の insert が
 * 弾かれ、関数ごと中断した）、CSV/PDF 出力3本が 400 になっていた。
 * 経緯は DECISION_LOG 2026-09-23、MISTAKE_LEDGER
 * `M-20260922-enumerated-actions-from-typescript-only`。
 *
 * どこで止まるようになったか
 * --------------------------
 * 1. TypeScript の書き手は `recordInsurerAccessLog` を通る。`action` は
 *    `InsurerAccessAction` 型なので、語彙外の値は **tsc が落とす**。
 * 2. この一覧と再生検査 `scripts/replay/checks/insurer_access_logs_action_vocab.sql`
 *    の一覧がずれたら `npm run check:audit-actions` が落とす（CI・pre-push）。
 * 3. その再生検査が、本物の Postgres に1値ずつ insert して CHECK が受け取ることを
 *    確かめる（`npm run check:migrations`）。
 *
 * つまり「型 → 検査の一覧 → 実際の CHECK」が1本に繋がっている。
 * **新しい `action` を足すときは、この配列と上記 SQL の配列を同じ PR で更新し、
 * CHECK を広げるマイグレーションも同じ PR に入れること。**
 *
 * SQL 関数と RPC が書く値もこの配列に載せている（型では縛れないが、CHECK との
 * 突き合わせ対象には入れる）。どの関数が書くかは再生検査の既知リストが見る。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** DB の `insurer_access_logs_action_check` が許す値の全体。順序は書き手ごと。 */
export const INSURER_ACCESS_ACTIONS = [
  // --- SQL 関数（insurer_search_certificates / insurer_get_certificate 等）が書く
  "view",
  "search",
  "download_pdf",
  "export_csv",
  "vehicle_search",
  "vehicle_view",
  "store_search",
  // --- TypeScript が直接書く
  "case_create",
  "case_update",
  "case_message",
  "case_bulk_update",
  "case_attachment_upload",
  "case_summary_auto",
  "case_assign_suggest_auto",
  "fraud_check",
  "fraud_check_auto",
  "pii_disclosure_request",
  // --- `insurer_audit_log` RPC の実引数（ドット区切り。正規表現で拾うときは注意）
  "insurer.export.csv",
  "insurer.export.csv.one",
  "insurer.export.pdf.one",
] as const;

export type InsurerAccessAction = (typeof INSURER_ACCESS_ACTIONS)[number];

/** 実行時に文字列を語彙に照合する（外から来た値を検査したいときだけ使う）。 */
export function isInsurerAccessAction(value: unknown): value is InsurerAccessAction {
  return typeof value === "string" && (INSURER_ACCESS_ACTIONS as readonly string[]).includes(value);
}

type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface InsurerAccessLogRow {
  insurer_id: string;
  /**
   * 書き手の保険会社ユーザー。**DB では NOT NULL・既定なし**で、さらに
   * `insurer_users(id)` への外部キーが張られているので、実在する行の id が要る。
   * 人の操作が無い自動処理は `resolveInsurerSystemActorId` でシステム行を引く。
   */
  insurer_user_id: string;
  action: InsurerAccessAction;
  certificate_id?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  user_agent?: string | null;
}

/**
 * `insurer_access_logs` に1行書く。**失敗しても throw しないが、黙って捨てない。**
 *
 * 以前はこの insert が 10 箇所に直書きされ、どこも戻り値の `error` を見ていなかった。
 * そのため CHECK に弾かれていた4か月の間、例外にもログにも一切現れなかった
 * （本番の同表は2行しか無く、どちらも `search`）。監査の記録は落ちてもリクエスト
 * 本体は通すべきなので throw はしないが、**落ちたことは必ずログに出す。**
 *
 * @param context ログに出す呼び出し元の識別子（例 "POST /api/insurer/cases"）。
 */
export async function recordInsurerAccessLog(
  admin: AnySupabaseClient,
  row: InsurerAccessLogRow,
  context: string,
): Promise<void> {
  const { error } = await admin.from("insurer_access_logs").insert({
    insurer_id: row.insurer_id,
    insurer_user_id: row.insurer_user_id,
    action: row.action,
    certificate_id: row.certificate_id ?? null,
    meta: row.meta ?? {},
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
  });

  if (error) {
    logger.error("[insurer-audit] insurer_access_logs への書き込みに失敗", error, {
      context,
      action: row.action,
      insurerId: row.insurer_id,
    });
  }
}

/**
 * 保険会社の「システム (自動処理)」行の id を引く。
 *
 * 人の操作が無い経路（AI の案件サマリ・担当提案・不正スコア）が監査行を残すために使う。
 * この行は `insurer_users.is_system = true` / `user_id IS NULL` で、ログインできない。
 * RLS のポリシーはすべて `user_id = auth.uid()` の等値比較なので、権限は一切持たない。
 * 行は `20260924133200` のマイグレーションと `insurers` への挿入トリガが用意する。
 *
 * 見つからなければ null を返す（呼び出し元は監査行を諦めるが、本体は続ける）。
 */
export async function resolveInsurerSystemActorId(
  admin: AnySupabaseClient,
  insurerId: string,
  context: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("insurer_users")
    .select("id")
    .eq("insurer_id", insurerId)
    .eq("is_system", true)
    .maybeSingle();

  if (error) {
    logger.error("[insurer-audit] システム行の取得に失敗", error, { context, insurerId });
    return null;
  }
  if (!data) {
    logger.error("[insurer-audit] この保険会社にシステム行が無い", undefined, { context, insurerId });
    return null;
  }
  return data.id as string;
}
