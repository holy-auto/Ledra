import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { signAssetPaths } from "@/lib/signedUrl";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: 証明書の施工写真を、短命の署名 URL つきで返す（モバイルアプリ用 Bearer Token 認証）。 [写真の非公開化 ②]
 *
 * モバイルは `certificate_images` を直接読み、保存パスから公開 URL（getPublicUrl）を作って表示していた。
 * 保存先（assets バケット）を非公開にすると表示できなくなるので、署名 URL をこの経路で受け取る。
 * 署名はユーザーロールでは発行できない（assets の RLS はユーザーロールを通さない）ので、テナント境界を
 * RLS で確認したうえで service-role で発行する。閲覧は所属メンバーなら誰でも（一覧表示と同じ）。
 *
 * `?variant=thumbnail` のときはサムネイル（無ければ原本）だけ署名する（一覧だけを出す画面用。署名の数を 3 分の 1 にする）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(request, "general");
    if (limited) return limited;

    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

    // 証明書がこのテナントに実在することを RLS スコープで確認（他テナントの写真に署名させない）
    const { data: cert, error: certErr } = await caller.supabase
      .from("certificates")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    // 一時障害を「無い」と言わない（モバイルは 404 を再試行しない）
    if (certErr) throw certErr;
    if (!cert?.id) return apiNotFound("証明書が見つかりません。");

    const { data: rows, error } = await caller.supabase
      .from("certificate_images")
      .select("id, storage_path, thumbnail_path, medium_path, stage, authenticity_grade")
      .eq("certificate_id", id)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const images = (rows ?? []) as Array<{
      id: string;
      storage_path: string;
      thumbnail_path: string | null;
      medium_path: string | null;
      stage: string | null;
      authenticity_grade: string | null;
    }>;
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const thumbOnly = new URL(request.url).searchParams.get("variant") === "thumbnail";
    const signed = await signAssetPaths(
      admin,
      images.flatMap((i) =>
        thumbOnly ? [i.thumbnail_path ?? i.storage_path] : [i.storage_path, i.thumbnail_path, i.medium_path],
      ),
    );
    const url = (p: string | null) => (p && signed.get(p)) || null;

    return apiOk({
      images: images.map((i) => ({
        id: i.id,
        stage: i.stage,
        authenticity_grade: i.authenticity_grade,
        /** 原本（端末保存用） */
        url: url(i.storage_path),
        /** 一覧用。サムネイルが無ければ原本 */
        thumbnail_url: url(i.thumbnail_path) ?? url(i.storage_path),
        /** 拡大表示用。中サイズが無ければ原本 */
        medium_url: url(i.medium_path) ?? url(i.storage_path),
        /** 拡張子の判定用（端末保存のファイル名） */
        ext: i.storage_path.split(".").pop()?.split("?")[0] ?? "jpg",
      })),
    });
  } catch (e) {
    return apiInternalError(e, "certificates.images");
  }
}
