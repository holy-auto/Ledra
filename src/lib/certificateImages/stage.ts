/**
 * 証明書写真の撮影段階タグの単一定義。
 *
 * DB 列 `certificate_images.stage` と、発行/サインオフの前後ゲート
 * (`src/lib/certificates/photoRequirement.ts` の `intake_before` / `after`) が
 * 期待するトークンをここに集約する。アップロード共通ハンドラ
 * (`uploadHandler.ts`) とモバイルの段階セレクタが同じ値を参照するための出典。
 *
 * モバイルアプリ (`apps/mobile`) は web の `src/` を import できないため、
 * モバイル側は同じ4値をローカル定数として複製する（本ファイルを出典コメントで指す）。
 */

/** 撮影段階タグ。`intake_before`=施工前(入庫時) / `in_progress`=作業中 / `after`=施工後 / `unspecified`=未指定。 */
export const STAGE_VALUES = ["intake_before", "in_progress", "after", "unspecified"] as const;

export type CertificatePhotoStage = (typeof STAGE_VALUES)[number];

/** 未指定・未知の入力を安全側の `unspecified` に正規化する。 */
export function normalizeStage(raw: string | null | undefined): CertificatePhotoStage {
  const value = (raw ?? "").trim();
  return (STAGE_VALUES as readonly string[]).includes(value) ? (value as CertificatePhotoStage) : "unspecified";
}
