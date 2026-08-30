/**
 * POS 会計の共通部分。
 *
 * なぜ要るか: 会計の記録は `pos_checkout`（SECURITY DEFINER）だが、この関数は
 * 引数の `p_tenant_id` / `p_user_id` をそのまま使い、**呼び出し元を一切検査しない**。
 * 端末から直接 RPC で呼べる状態だと、ログインしてさえいれば他テナントの売上も
 * 作れてしまう。そのため `pos_checkout` の EXECUTE は service_role だけに絞り、
 * 端末からは必ずサーバ経由（`/api/mobile/pos/checkout` と
 * `/api/mobile/pos/terminal/capture`）で呼ぶ。
 *
 * ここに置くのは**サーバの戻りの読み方**だけ。api.ts（= supabase.ts）を import
 * しないので `node src/lib/pos.check.ts` で単体で動かせる。
 */

/**
 * POS の明細1行。`pos_checkout` は `p_items_json` を**そのまま**
 * `documents.items_json` に入れるだけなので、ここは帳票の明細の形に揃える。
 *
 * 品名のキーは `description`。`DocumentItem`（src/types/document.ts）も
 * Web の POS も帳票の表示側も `description` を使う。モバイルだけ `name` で
 * 送っていたため、**スマホで切った領収書は Web/PDF で品名が出ず「小計」と
 * 表示されていた**。
 */
export interface PosCheckoutItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

/**
 * 画面が持っている明細（予約の menu_items / ウォークインのカート）を
 * pos_checkout が受け取る形へ揃える。
 *
 * `amount` は予約側では計算済み（`unitPrice * quantity`、単価不明なら null）、
 * カート側では持っていない。どちらも同じ式になるよう単価×数量で補う。
 */
export function toPosItems(
  items: ReadonlyArray<{
    name: string;
    quantity: number;
    unitPrice?: number | null;
    amount?: number | null;
  }>,
): PosCheckoutItem[] {
  return items.map((it) => ({
    description: it.name,
    quantity: it.quantity,
    unit_price: it.unitPrice ?? 0,
    amount: it.amount ?? (it.unitPrice ?? 0) * it.quantity,
  }));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * `/pos/checkout` と `/pos/terminal/capture` の戻りから payment_id を取り出す。
 * どちらも `{ ok, result }` の形で、`result` が pos_checkout の戻り（jsonb）。
 *
 * jsonb が文字列で返る経路もあったので、文字列も受ける。
 * 取り出せなければ null（画面はレシートへ飛ばさず一覧へ戻す）。
 */
export function paymentIdOf(payload: unknown): string | null {
  const raw = asRecord(payload)?.result;
  let result = asRecord(raw);
  if (!result && typeof raw === "string") {
    try {
      result = asRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  const id = result?.payment_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
