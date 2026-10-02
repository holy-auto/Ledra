/**
 * 整備業の法定資格・職責の正準語彙（G1 / e-maintenance-record-compliance 第２ ３（１）①）。
 *
 * 道路運送車両法に基づく点検整備記録簿の電子的方法の基準は、利用者を**権限別に**登録・管理
 * することを求め、その例として「自動車検査員」「整備主任者」「点検整備記録簿等を起票・入力する
 * 権限」を挙げる。Ledra の汎用 SaaS ロール（super_admin/owner/admin/staff/viewer）や作業者の
 * `skills[]`（自由タグ）はこの**法定資格の軸を持たない**（compliance doc G1）。
 *
 * ここはその軸の単一定義源。`skills[]`（自由入力の技能タグ）とは別軸で、**統制語彙**（ここに
 * 定義したキーだけ）を staff_members.qualifications に持たせる。ロール（認可の強さ）とも混ぜない
 * —— 1 カラム 1 軸（CLAUDE.md ドメイン状態語彙ルール）。
 *
 * スコープ注記: 本モジュールは「誰がどの資格を持つか」を表す軸と、その入力検証・表示ラベルまで。
 * 資格に基づく操作の強制（例: 完成検査の確定は自動車検査員のみ）と、資格番号・有効期限の保持は
 * 後続（OPEN_QUESTIONS）。
 */

export type StaffQualificationKey = "vehicle_inspector" | "maintenance_supervisor" | "record_author";

export const STAFF_QUALIFICATIONS: { key: StaffQualificationKey; label: string; note: string }[] = [
  {
    key: "vehicle_inspector",
    label: "自動車検査員",
    note: "指定整備事業者における完成検査を担う法定資格。",
  },
  {
    key: "maintenance_supervisor",
    label: "整備主任者",
    note: "分解整備の実施・点検整備記録簿の記録を統括する法定資格。",
  },
  {
    key: "record_author",
    label: "記録簿起票・入力担当",
    note: "点検整備記録簿等を起票・入力する権限を持つ担当。",
  },
];

const KEYS = new Set<string>(STAFF_QUALIFICATIONS.map((q) => q.key));
const LABELS: Record<string, string> = Object.fromEntries(STAFF_QUALIFICATIONS.map((q) => [q.key, q.label]));

/** 統制語彙のキーか（未知の文字列を弾くための述語）。 */
export function isStaffQualificationKey(v: unknown): v is StaffQualificationKey {
  return typeof v === "string" && KEYS.has(v);
}

/**
 * 入力配列を正準キーだけに正規化する（未知キーは除外・重複除去・順序保持）。
 * `skills[]` は自由タグだが資格は統制語彙なので、ここで集合外を落とす。
 */
export function normalizeQualifications(input: readonly unknown[] | null | undefined): StaffQualificationKey[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: StaffQualificationKey[] = [];
  for (const v of input) {
    if (isStaffQualificationKey(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** キー → 表示ラベル（未知キーはそのまま返す＝将来の値でも壊さない）。 */
export function qualificationLabel(key: string): string {
  return LABELS[key] ?? key;
}
