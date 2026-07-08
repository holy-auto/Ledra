/**
 * 通知配信ログ (notification_logs) の集計 — 「リマインドが実際に届いているか」を
 * 可視化するための純ロジック。IO は API ルートに置く。
 *
 * type は `expiry_reminder_60d` / `follow_up_90d` / `birthday_2026` /
 * `maintenance_reminder_6m` のように接尾辞 (日数・月数・年) を持つため、基底カテゴリへ
 * 正規化してから集計する。
 */

export interface NotifLogRow {
  type: string;
  status: string; // "sent" | "failed"
  channel?: string | null; // "email" | "line"
  sent_at?: string | null;
}

/** 接尾辞 (_60d / _6m / _2026 等) を落として基底カテゴリ名にする。 */
export function normalizeNotifType(type: string): string {
  return type.replace(/_\d+(d|m)?$/u, "");
}

const TYPE_LABELS: Record<string, string> = {
  service_reminder: "定期点検・交換",
  inspection_reminder: "車検満了",
  warranty_end_reminder: "保証満了",
  maintenance_reminder: "メンテナンス",
  birthday: "誕生日",
  expiry_reminder: "有効期限",
  follow_up: "施工後フォロー",
  first_reminder: "初回フォロー",
  seasonal: "季節提案",
};

/** 配信可観測性で「来ていてほしい」主要リマインド種別 (0 件検出に使う)。 */
export const KNOWN_REMINDER_TYPES = [
  "service_reminder",
  "inspection_reminder",
  "warranty_end_reminder",
  "maintenance_reminder",
  "birthday",
  "follow_up",
] as const;

export function labelForType(baseType: string): string {
  return TYPE_LABELS[baseType] ?? baseType;
}

export interface TypeSummary {
  type: string;
  label: string;
  sent: number;
  failed: number;
  total: number;
  /** 失敗率 (0〜1)。total=0 のとき 0。 */
  failure_rate: number;
  line: number;
  email: number;
}

export interface NotificationSummary {
  by_type: TypeSummary[];
  totals: { sent: number; failed: number; total: number; failure_rate: number };
  /** 集計期間内に 1 件も配信が無かった主要リマインド種別 (label のリスト)。 */
  silent_types: string[];
}

export function summarizeNotifications(rows: NotifLogRow[]): NotificationSummary {
  const map = new Map<string, TypeSummary>();
  let totSent = 0;
  let totFailed = 0;

  for (const r of rows) {
    const base = normalizeNotifType(r.type);
    let s = map.get(base);
    if (!s) {
      s = { type: base, label: labelForType(base), sent: 0, failed: 0, total: 0, failure_rate: 0, line: 0, email: 0 };
      map.set(base, s);
    }
    const failed = r.status === "failed";
    if (failed) {
      s.failed++;
      totFailed++;
    } else {
      s.sent++;
      totSent++;
    }
    s.total++;
    if (r.channel === "line") s.line++;
    else if (r.channel === "email") s.email++;
  }

  const by_type = [...map.values()]
    .map((s) => ({ ...s, failure_rate: s.total > 0 ? s.failed / s.total : 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const present = new Set(map.keys());
  const silent_types = KNOWN_REMINDER_TYPES.filter((t) => !present.has(t)).map((t) => labelForType(t));

  const total = totSent + totFailed;
  return {
    by_type,
    totals: { sent: totSent, failed: totFailed, total, failure_rate: total > 0 ? totFailed / total : 0 },
    silent_types,
  };
}
