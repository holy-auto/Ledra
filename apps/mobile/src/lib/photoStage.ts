/**
 * 撮影段階タグ（モバイル側ローカル定義）。
 *
 * 出典: web `src/lib/certificateImages/stage.ts`。モバイルは web の `src/` を
 * import できないため同じ4値を複製する。ここが drift するとサーバの
 * `normalizeStage` に弾かれ `unspecified` へ落ちるため、値は必ず出典と一致させる。
 *
 * intake_before=施工前(入庫時) / in_progress=作業中 / after=施工後 / unspecified=未指定。
 */
export type CertificatePhotoStage = "intake_before" | "in_progress" | "after" | "unspecified";

/** 撮影画面のセレクタに出す段階（unspecified は明示選択させないので除外）。 */
export const STAGE_OPTIONS: { value: Exclude<CertificatePhotoStage, "unspecified">; label: string }[] = [
  { value: "intake_before", label: "施工前" },
  { value: "in_progress", label: "作業中" },
  { value: "after", label: "施工後" },
];
