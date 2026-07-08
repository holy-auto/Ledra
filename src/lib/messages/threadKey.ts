/**
 * 会話受信箱の「スレッドキー」エンコード/デコード — 純関数のみ。
 *
 * 受信箱 (/admin/messages) は customer_messages を「スレッド」に畳んで扱う。
 * スレッドは次のどちらかで識別する:
 *   - customer に紐付いている     → "c:<customerId>"
 *   - まだ customer 未紐付け (LINE) → "l:<lineUserId>"
 *
 * URL セグメントやクライアント state でこのキーを使い回すため、解釈は 1 箇所に
 * 集約してテスト可能にしておく。
 */

export type ThreadRef =
  | { kind: "customer"; customerId: string }
  | { kind: "line"; lineUserId: string }
  | { kind: "email"; emailFrom: string }
  | { kind: "invalid" };

/** customer / line / email から表示・保存用のスレッドキーを作る。 */
export function customerThreadKey(customerId: string): string {
  return `c:${customerId}`;
}

export function lineThreadKey(lineUserId: string): string {
  return `l:${lineUserId}`;
}

/** メール未紐付けスレッド (送信元アドレスで束ねる)。 */
export function emailThreadKey(emailFrom: string): string {
  return `e:${emailFrom}`;
}

/**
 * "c:<uuid>" / "l:<lineUserId>" / "e:<emailFrom>" を解釈する。
 * 既に decode 済みの文字列でも、URL エンコードされた文字列でも受け付ける。
 */
export function parseThreadKey(raw: string): ThreadRef {
  if (typeof raw !== "string" || raw.length === 0) return { kind: "invalid" };
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    // 不正な % シーケンスはそのまま扱う
  }
  if (key.startsWith("c:")) {
    const customerId = key.slice(2);
    return customerId ? { kind: "customer", customerId } : { kind: "invalid" };
  }
  if (key.startsWith("l:")) {
    const lineUserId = key.slice(2);
    return lineUserId ? { kind: "line", lineUserId } : { kind: "invalid" };
  }
  if (key.startsWith("e:")) {
    const emailFrom = key.slice(2);
    return emailFrom ? { kind: "email", emailFrom } : { kind: "invalid" };
  }
  return { kind: "invalid" };
}
