/**
 * 法定資格の「保有の有無 ＋ 有効期限」から現時点で有効かを判定する純関数（G1/#1・#2）。
 *
 * 「どの資格を保有するか」は staff_members.qualifications（text[]）が源泉、番号・有効期限は
 * staff_qualifications 明細表が持つ（任意）。ここは両者を受け取り、副作用なしに判定・スナップショット
 * を作る。DB 参照・テナント境界は inspectorQualification.ts 側（フェイルクローズ）。
 *
 * 期限判定は **Asia/Tokyo の当日** で行う。サーバは UTC 稼働のため、UTC 日付で境界を見ると
 * 日本時間の最終日に半日早く失効扱いになりうる（CLAUDE.md「現場のキャリブレーション」）。
 */

import { isStaffQualificationKey, normalizeQualifications, type StaffQualificationKey } from "./qualifications";

/** staff_qualifications 明細の 1 行（番号・有効期限は任意）。 */
export type QualificationDetail = {
  qualification: string;
  number: string | null;
  expires_on: string | null; // "YYYY-MM-DD" もしくは null（無期限扱い）
};

/** Asia/Tokyo の当日を "YYYY-MM-DD" で返す。en-CA ロケールは ISO 形式の日付を返す。 */
export function todayInJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 指定資格を「今」有効に保有しているか。
 * - 保有（held に key がある）が前提。無ければ false。
 * - 明細に有効期限があれば、当日 <= 期限（期限当日まで有効）。無ければ無期限扱いで true。
 * - "YYYY-MM-DD" 同士は辞書順比較で日付順と一致する。
 */
export function isQualificationValid(
  held: readonly string[],
  details: readonly QualificationDetail[],
  key: StaffQualificationKey,
  today: string = todayInJst(),
): boolean {
  if (!held.includes(key)) return false;
  const d = details.find((x) => x.qualification === key);
  if (!d || !d.expires_on) return true; // 有効期限未登録＝無期限扱い
  return today <= d.expires_on;
}

/**
 * 実施時点のスナップショット: 保有する法定資格キーごとに {qualification, number, expires_on} を返す。
 * 後から資格・番号・期限が変わっても記録簿側は実施時点の事実を保持できる（G1/#3）。
 * held は正準キーに正規化（未知キー除外・重複除去）。番号/期限は明細があれば採り、無ければ null。
 */
export function buildQualificationSnapshot(
  held: readonly unknown[] | null | undefined,
  details: readonly QualificationDetail[],
): QualificationDetail[] {
  const keys = normalizeQualifications(held);
  return keys.map((key) => {
    const d = details.find((x) => x.qualification === key);
    return { qualification: key, number: d?.number ?? null, expires_on: d?.expires_on ?? null };
  });
}

/** 任意の入力配列を QualificationDetail[] に安全化（未知形状・未知キーを捨てる）。DB 返却の防御的整形。 */
export function normalizeQualificationDetails(input: unknown): QualificationDetail[] {
  if (!Array.isArray(input)) return [];
  const out: QualificationDetail[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (!isStaffQualificationKey(r.qualification)) continue;
    out.push({
      qualification: r.qualification,
      number: typeof r.number === "string" ? r.number : null,
      expires_on: typeof r.expires_on === "string" ? r.expires_on : null,
    });
  }
  return out;
}
