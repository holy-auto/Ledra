/**
 * 「次の接触」集約 — 顧客に近々連絡すべき理由 (定期点検 / 車検満了 / 保証満了 /
 * 誕生日) を 1 つのリストにまとめるための純ロジック。
 *
 * IO (DB 取得) は API ルート側に置き、本モジュールは「正規化済みの接触候補 →
 * 日数算出・トーン分類・並べ替え・集計」だけを担う (テスト容易性のため)。
 */

export type TouchReason = "service" | "inspection" | "warranty" | "birthday";
export type TouchTone = "overdue" | "today" | "soon";

export interface TouchItem {
  /** 重複排除・React key 用の安定キー。 */
  id: string;
  customer_id: string;
  customer_name: string;
  reason: TouchReason;
  /** 見出し (例: 車検満了 / エンジンオイル交換 / 保証満了 / 誕生日)。 */
  title: string;
  /** 補助情報 (車両ラベル等)。無ければ null。 */
  detail: string | null;
  /** 期日 (YYYY-MM-DD)。誕生日は今年の該当日。距離ベースなど日付が無い場合は null。 */
  due_date: string | null;
  /** 期日までの日数 (負 = 超過)。due_date が無い距離ベースは 0 (=今日扱い) を入れる。 */
  days_until: number;
  tone: TouchTone;
  /** 連絡手段 (LINE 優先 → メール → 電話)。 */
  channel: "line" | "email" | "phone" | "none";
}

/** YYYY-MM-DD の暦日差 (target - today)。不正な入力は null。 */
export function daysUntilDate(dateStr: string | null | undefined, today: Date): number | null {
  const ymd = dateStr?.slice(0, 10);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const target = new Date(`${ymd}T00:00:00Z`).getTime();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - todayUtc) / 86_400_000);
}

/** 日数 → トーン。負 = 超過 / 0 = 今日 / 正 = まもなく。 */
export function toneForDays(daysUntil: number): TouchTone {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  return "soon";
}

/** 連絡手段を顧客の保有チャネルから決める。 */
export function channelFor(c: {
  line_user_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): TouchItem["channel"] {
  if (c.line_user_id) return "line";
  if (c.email) return "email";
  if (c.phone) return "phone";
  return "none";
}

/**
 * 接触リストを並べ替える: 超過 → 今日 → まもなく の順、同トーン内は期日が近い順、
 * さらに顧客名で安定ソート。
 */
export function sortTouches(items: TouchItem[]): TouchItem[] {
  const toneRank: Record<TouchTone, number> = { overdue: 0, today: 1, soon: 2 };
  return [...items].sort(
    (a, b) =>
      toneRank[a.tone] - toneRank[b.tone] ||
      a.days_until - b.days_until ||
      a.customer_name.localeCompare(b.customer_name) ||
      a.id.localeCompare(b.id),
  );
}

export interface NextTouchSummary {
  total: number;
  overdue: number;
  today: number;
  soon: number;
  /** 連絡可能 (line/email/phone のいずれかあり) な件数。 */
  reachable: number;
}

export function summarizeTouches(items: TouchItem[]): NextTouchSummary {
  return {
    total: items.length,
    overdue: items.filter((i) => i.tone === "overdue").length,
    today: items.filter((i) => i.tone === "today").length,
    soon: items.filter((i) => i.tone === "soon").length,
    reachable: items.filter((i) => i.channel !== "none").length,
  };
}
