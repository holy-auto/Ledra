/**
 * 必須ショット進捗 — 純関数 (IMP-023 §7)
 *
 * ワークフローの工程ガイドが「この工程で撮る写真」を宣言し、実際にアップロード
 * された certificate_images の stage タグと突き合わせて進捗を算出する。
 *
 * DB 値(アップロード済み写真の stage 一覧)と宣言(required shots)の
 * マッチングだけを行う純関数で、IO を持たない。
 */

import type { CertificatePhotoStage } from "./stage";

/** 必須ショット 1 項目の宣言。 */
export interface RequiredShot {
  /** 段階タグ: intake_before / in_progress / after。 */
  stage: CertificatePhotoStage;
  /** 表示ラベル (例: "施工前の全体写真")。 */
  label: string;
  /** この段階で必要な最低枚数。省略時 = 1。 */
  minCount?: number;
}

/** 1 項目の充足判定結果。 */
export interface ShotProgress {
  stage: CertificatePhotoStage;
  label: string;
  required: number;
  uploaded: number;
  fulfilled: boolean;
}

/** 全体の進捗サマリー。 */
export interface EvidenceProgress {
  /** 必須ショット項目数。 */
  total: number;
  /** 充足済み項目数。 */
  fulfilled: number;
  /** 未充足の項目一覧。 */
  missing: ShotProgress[];
  /** 各項目の詳細。 */
  items: ShotProgress[];
  /** 全項目充足か。 */
  complete: boolean;
}

/**
 * 必須ショットとアップロード済み写真を突き合わせて進捗を返す。
 *
 * @param required  工程ガイドが宣言する必須ショット一覧
 * @param uploadedStages  アップロード済み写真の stage タグ配列
 *                        (同じ stage が複数あれば枚数カウント)
 */
export function computeEvidenceProgress(
  required: readonly RequiredShot[],
  uploadedStages: readonly string[],
): EvidenceProgress {
  // stage ごとのアップロード残数を集計。stage は施工前/作業中/施工後の粗い
  // 4値しかなく、同じ stage を宣言する必須ショットが複数ありうる
  // (例: 施工前の全体写真+傷口接写を両方必須にする)。宣言順に消費するので、
  // 同じ写真が複数の必須項目を二重に満たしたことにはならない。
  const remaining = new Map<string, number>();
  for (const s of uploadedStages) {
    remaining.set(s, (remaining.get(s) ?? 0) + 1);
  }

  const items: ShotProgress[] = required.map((r) => {
    const needed = r.minCount ?? 1;
    const available = remaining.get(r.stage) ?? 0;
    remaining.set(r.stage, Math.max(0, available - needed));
    return {
      stage: r.stage,
      label: r.label,
      required: needed,
      uploaded: available,
      fulfilled: available >= needed,
    };
  });

  const missing = items.filter((i) => !i.fulfilled);

  return {
    total: items.length,
    fulfilled: items.length - missing.length,
    missing,
    items,
    complete: missing.length === 0,
  };
}
