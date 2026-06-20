/**
 * スタッフのスキルタグと、案件（施工メニュー）とのマッチング。
 *
 * スキルは自由テキストのタグ（例: "PPF", "ガラスコーティング", "磨き"）。
 * 案件側は予約タイトル + メニュー名のテキストから施工内容を推定し、
 * 担当者スキルとの重なりで「スキルマッチ」のヒントを出す。
 * 完全自動アサインではなく、UI 上の推奨ハイライト用途。
 */

/** ワークフローテンプレートの service_type と揃えた正規カテゴリ。 */
export const SERVICE_TYPES = [
  { key: "coating", label: "コーティング" },
  { key: "ppf", label: "PPF" },
  { key: "wrapping", label: "ラッピング" },
  { key: "polish", label: "磨き" },
  { key: "body_repair", label: "板金" },
  { key: "other", label: "その他" },
] as const;

/** スキルタグの入力候補（UI のサジェスト用）。自由入力も可。 */
export const SUGGESTED_SKILLS = [
  "コーティング",
  "ガラスコーティング",
  "セラミック",
  "PPF",
  "プロテクションフィルム",
  "ラッピング",
  "磨き",
  "研磨",
  "板金",
  "内装",
  "ヘッドライト",
] as const;

/** service_type キー → 推定スキルタグ（日本語）。 */
const SERVICE_TYPE_TO_SKILLS: Record<string, string[]> = {
  coating: ["コーティング", "ガラスコーティング", "セラミック"],
  ppf: ["PPF", "プロテクションフィルム"],
  wrapping: ["ラッピング"],
  polish: ["磨き", "研磨"],
  body_repair: ["板金"],
  other: [],
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * 案件テキスト（タイトル + メニュー名など）と service_type から、
 * 必要スキルの推定タグ配列を返す。重複は除去。
 */
export function inferJobSkillTags(text: string | null | undefined, serviceType?: string | null): string[] {
  const out = new Set<string>();

  if (serviceType) {
    for (const tag of SERVICE_TYPE_TO_SKILLS[norm(serviceType)] ?? []) out.add(tag);
  }

  const hay = norm(text ?? "");
  if (hay) {
    for (const skill of SUGGESTED_SKILLS) {
      if (hay.includes(norm(skill))) out.add(skill);
    }
  }

  return [...out];
}

/**
 * 双方向の部分一致でタグが一致するか。
 * "コーティング" と "ガラスコーティング" のような包含関係も拾う。
 */
function tagsOverlap(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * 担当者スキルと案件タグの一致数（マッチした担当者スキルの個数）。
 * 0 ならマッチなし。
 */
export function skillMatchScore(
  staffSkills: string[] | null | undefined,
  jobTags: string[] | null | undefined,
): number {
  const skills = staffSkills ?? [];
  const tags = jobTags ?? [];
  if (!skills.length || !tags.length) return 0;

  let score = 0;
  for (const s of skills) {
    if (tags.some((t) => tagsOverlap(s, t))) score++;
  }
  return score;
}

export function isSkillMatch(staffSkills: string[] | null | undefined, jobTags: string[] | null | undefined): boolean {
  return skillMatchScore(staffSkills, jobTags) > 0;
}
