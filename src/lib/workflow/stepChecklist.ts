/**
 * 工程ガイド（写真ガイド／確認チェックリスト）— 状態計算 (純関数)
 *
 * ワークフローの各工程に「この工程で撮る写真」「確認する項目」を宣言し、現場作業者へ
 * ガイドとして提示するための判定ロジック。ベテランの頭の中（何を撮るか・何を確認するか）
 * を steps に形式知化し、新人でも撮り忘れ・確認漏れを起こしにくくする。
 *
 * 思想「現場に記録作業を増やさない／強制停止は最小限」に従い、ここは判定のみを行い、
 * 進行のブロックはしない（UI 側で警告として提示する）。IO を持たない純関数なので
 * 単体テストしやすい（`src/lib/signoff/state.ts` と同じ方針）。
 */

/** 工程に宣言されたガイド定義（`workflow_templates.steps[]` の一部・すべて任意）。 */
export interface StepGuideInput {
  required_photos?: string[] | null;
  checklist?: string[] | null;
}

/** ガイド1項目の表示状態。 */
export interface GuideItem {
  label: string;
  /** 作業者が確認済み（チェック済み）か。 */
  done: boolean;
}

export interface StepGuideState {
  /** この工程で撮る写真のガイド。 */
  photos: GuideItem[];
  /** この工程で確認する項目。 */
  checks: GuideItem[];
  /** ガイド項目の総数。0 ならこの工程にガイドは無い。 */
  total: number;
  /** 未確認（未チェック）の項目数。 */
  outstanding: number;
  /** ガイドが無い、または全項目が確認済みか。 */
  allSatisfied: boolean;
}

/**
 * 重複・前後空白・空文字を除去して表示用に正規化する（初出順を保持）。
 * 現場での手入力・改行区切り入力を安全に扱うための下ごしらえ。
 */
export function normalizeGuideList(list: string[] | null | undefined): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = (raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** この工程にガイド（写真 or 確認項目）が定義されているか。 */
export function hasStepGuide(step: StepGuideInput): boolean {
  return normalizeGuideList(step.required_photos).length > 0 || normalizeGuideList(step.checklist).length > 0;
}

/**
 * 工程ガイドの状態を計算する。
 * `confirmed` は作業者がチェック済みの項目ラベル集合（写真・確認項目それぞれ）。
 */
export function computeStepGuideState(
  step: StepGuideInput,
  confirmed: { photos?: Iterable<string>; checks?: Iterable<string> } = {},
): StepGuideState {
  const confirmedPhotos = new Set(confirmed.photos ?? []);
  const confirmedChecks = new Set(confirmed.checks ?? []);

  const photos: GuideItem[] = normalizeGuideList(step.required_photos).map((label) => ({
    label,
    done: confirmedPhotos.has(label),
  }));
  const checks: GuideItem[] = normalizeGuideList(step.checklist).map((label) => ({
    label,
    done: confirmedChecks.has(label),
  }));

  const total = photos.length + checks.length;
  const outstanding = photos.filter((p) => !p.done).length + checks.filter((c) => !c.done).length;

  return { photos, checks, total, outstanding, allSatisfied: outstanding === 0 };
}
