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
