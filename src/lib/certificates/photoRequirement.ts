/**
 * 施工証明書の「写真添付必須」ルール。
 *
 * 全テナント一律のプラットフォームルールとして、証明書を `active`
 * (発行済み) にするには施工写真 (`certificate_images`) が最低 1 枚必要。
 *
 * 写真は証明書本体の作成後に別エンドポイント
 * (`/api/certificates/images/upload`) からアップロードされるため、
 * 新規作成時点では 0 枚になる。したがって「発行」は必ず
 *   作成 (draft) → 写真アップロード → 活性化 (draft→active)
 * の順で行い、活性化のチョークポイント (status / activate ルート) で
 * 本ルールをサーバ強制する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 発行に必要な最低写真枚数。 */
export const MIN_CERTIFICATE_PHOTOS = 1;

/** 写真不足で発行をブロックしたときにユーザへ返すメッセージ。 */
export const CERTIFICATE_PHOTO_REQUIRED_MESSAGE =
  "施工証明書の発行には施工写真が1枚以上必要です。写真を添付してから発行してください。";

/**
 * 指定証明書に紐づく施工写真 (`certificate_images`) の枚数を数える。
 *
 * `certificate_images` に tenant_id 列は無く、親 `certificates` 行で
 * テナントスコープ済みのため、ここでは certificate_id のみで絞る。
 * 呼び出し側は必ずテナントスコープ済みの certificateId を渡すこと。
 */
export async function countCertificatePhotos(admin: SupabaseClient, certificateId: string): Promise<number> {
  const { count, error } = await admin
    .from("certificate_images")
    .select("id", { count: "exact", head: true })
    .eq("certificate_id", certificateId);
  if (error) throw error;
  return count ?? 0;
}

/** 発行に必要な枚数の写真が添付済みかどうか。 */
export async function certificateHasRequiredPhotos(admin: SupabaseClient, certificateId: string): Promise<boolean> {
  return (await countCertificatePhotos(admin, certificateId)) >= MIN_CERTIFICATE_PHOTOS;
}

// ============================================================
// 施工前後写真ルール (案件サインオフ・ワークフロー専用)
// ============================================================
//
// 「作業前後で傷など後から揉める」トラブルを潰すため、お客様サイン依頼の
// 前提として施工前 (入庫時) と施工後の写真を両方要求する。
//
// これは受領サイン依頼のチョークポイントでのみ強制する追加ルールであり、
// 従来の証明書発行 (draft→active, 最低1枚) の挙動は変えない。段階タグは
// アップロード時に `certificate_images.stage` へ付与される
// (intake_before / in_progress / after / unspecified)。

/** 施工前後写真の充足状態。 */
export interface BeforeAfterPhotoState {
  /** 施工前 (入庫時) 写真: stage='intake_before' が1枚以上。 */
  hasBefore: boolean;
  /** 施工後 写真: stage='after' が1枚以上。 */
  hasAfter: boolean;
  /** 両方揃っているか。 */
  ok: boolean;
}

/** 施工前後写真が不足でサイン依頼をブロックしたときのメッセージ。 */
export const BEFORE_AFTER_PHOTO_REQUIRED_MESSAGE =
  "お客様サイン依頼には「施工前(入庫時)」と「施工後」の写真が必要です。" +
  "写真アップロード時に段階タグ (施工前 / 施工後) を付けて両方を添付してください。";

/**
 * 指定証明書に施工前 (intake_before) と施工後 (after) の写真が
 * それぞれ1枚以上あるかを判定する。
 *
 * 親 `certificates` 行でテナントスコープ済みのため certificate_id のみで絞る。
 * 呼び出し側は必ずテナントスコープ済みの certificateId を渡すこと。
 */
export async function certificateBeforeAfterState(
  admin: SupabaseClient,
  certificateId: string,
): Promise<BeforeAfterPhotoState> {
  const { data, error } = await admin.from("certificate_images").select("stage").eq("certificate_id", certificateId);
  if (error) throw error;

  const stages = new Set((data ?? []).map((r) => (r as { stage: string | null }).stage));
  const hasBefore = stages.has("intake_before");
  const hasAfter = stages.has("after");
  return { hasBefore, hasAfter, ok: hasBefore && hasAfter };
}

// ============================================================
// Before/After メディア必須ルール (コーティング・PPF証明書専用)
// ============================================================
//
// コーティング・PPF施工証明書は Before/After 写真も発行に必須とする。
//
// 目的: 施工前後の比較写真を撮る運用は元々多くの現場で行われているため、新しい作業を
// 課さずに「任意」を「必須」へ引き上げるだけで、施工そのものが行われた根拠を強める
// （設計: docs/coating-ppf-integrity-design.md）。膜厚など他のごまかし検知とは独立。
// 上記の案件サインオフ用ルール (certificate_images.stage) とは別物 —
// こちらは certificate_media (media_type='before_after') を見る。

export const BEFORE_AFTER_REQUIRED_SERVICE_TYPES = ["coating", "ppf"] as const;

export const CERTIFICATE_BEFORE_AFTER_REQUIRED_MESSAGE =
  "コーティング・PPF施工証明書の発行には施工前後(Before/After)の写真が必要です。写真を添付してから発行してください。";

/** この service_type は Before/After 写真の添付が発行条件か。 */
export function requiresBeforeAfterMedia(serviceType: string | null | undefined): boolean {
  return (BEFORE_AFTER_REQUIRED_SERVICE_TYPES as readonly string[]).includes(serviceType ?? "");
}

/**
 * 指定証明書に紐づく Before/After メディア (`certificate_media`, media_type='before_after') の枚数。
 * このメディア種別は before_path/storage_path(after) の両方が揃って初めて1行になる
 * （DB制約 `certmedia_before_after_requires_before`）ため、1行以上あれば前後両方が揃っている。
 */
export async function countCertificateBeforeAfterMedia(admin: SupabaseClient, certificateId: string): Promise<number> {
  const { count, error } = await admin
    .from("certificate_media")
    .select("id", { count: "exact", head: true })
    .eq("certificate_id", certificateId)
    .eq("media_type", "before_after");
  if (error) throw error;
  return count ?? 0;
}

/** Before/After 写真が必要な service_type について、添付済みかどうか。 */
export async function certificateHasRequiredBeforeAfterMedia(
  admin: SupabaseClient,
  certificateId: string,
  serviceType: string | null | undefined,
): Promise<boolean> {
  if (!requiresBeforeAfterMedia(serviceType)) return true;
  return (await countCertificateBeforeAfterMedia(admin, certificateId)) >= 1;
}
