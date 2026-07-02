import type { SupabaseClient } from "@supabase/supabase-js";
import { todayJst } from "@/lib/gantt/board";

/**
 * 請求書番号 INV-YYYYMM-NNN の共有採番ヘルパ。
 *
 * 以前は各ルートが `order("doc_number", { ascending: false }).limit(1)` で
 * 最大を取っていたが、これは **文字列ソート**なので "…-999" > "…-1000" となり、
 * 999 を超えると 1000 を延々と再発行し続ける。対象月の doc_number を取得し、
 * 末尾連番を**数値**としてパースして最大値 + 1 を返すことで解消する。
 * ゼロ詰めは 3 桁以上（1000 以降は桁を切らない）。
 *
 * 採番と INSERT の間には TOCTOU があるため、一意性の最終防壁は
 * documents(tenant_id, doc_number) の UNIQUE 索引 + insertInvoiceWithRetry の
 * 23505 リトライで担保する。
 *
 * ponytail: 対象月の invoice 行を全件取得して JS で max を取る O(n) 走査。
 *   1 テナント 1 か月の請求書は現実的に高々数百件で問題ないが、桁違いに
 *   増えたら数値キャストの RPC / DB シーケンス採番へ移行する。
 */
export async function nextInvoiceNumber(admin: SupabaseClient, tenantId: string, ym: string): Promise<string> {
  const prefix = `INV-${ym}-`;
  const { data } = await admin
    .from("documents")
    .select("doc_number")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .like("doc_number", `${prefix}%`);

  let maxSeq = 0;
  for (const row of data ?? []) {
    const num = parseInt(String(row.doc_number ?? "").slice(prefix.length), 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/** 対象日（JST）から採番用の YYYYMM を導出する。UTC 深夜が前月に寄るのを防ぐ。 */
export function invoiceYm(now: Date = new Date()): string {
  const ymd = todayJst(now); // "YYYY-MM-DD" (JST)
  return ymd.slice(0, 4) + ymd.slice(5, 7);
}

/**
 * doc_number を採番して INSERT し、UNIQUE 衝突（23505）時は採番からやり直す。
 * 同時作成の競合で同一番号が採られても、リトライで次の番号に振り直す。
 * fixedNumber 指定時（ユーザが番号を明示）はリトライせず 1 回だけ試す。
 *
 * R は Supabase の応答型 ({ data, error }) をそのまま推論させ、呼び出し側で
 * data の型が保たれるようにする（Supabase のビルダは Promise ではなく thenable
 * なので PromiseLike で受ける）。
 */
export async function insertInvoiceWithRetry<R extends { data: unknown; error: { code?: string | null } | null }>(
  admin: SupabaseClient,
  tenantId: string,
  insert: (docNumber: string) => PromiseLike<R>,
  opts: { fixedNumber?: string | null; now?: Date } = {},
): Promise<R> {
  const ym = invoiceYm(opts.now);
  const attempts = opts.fixedNumber ? 1 : 5;
  let last = await insert(opts.fixedNumber || (await nextInvoiceNumber(admin, tenantId, ym)));
  for (let i = 1; i < attempts; i++) {
    if (!last.error || last.error.code !== "23505") return last;
    last = await insert(opts.fixedNumber || (await nextInvoiceNumber(admin, tenantId, ym)));
  }
  return last; // 全リトライ失敗（最後の 23505 をそのまま返す）
}
