import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_MEDIA_BUCKET } from "@/lib/certificateMedia";
import { apiOk, apiInternalError, apiNotFound } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";

export const runtime = "nodejs";

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;
      if (!id) return apiNotFound("メディアが見つかりません。");

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { data: row } = await admin
        .from("certificate_media")
        .select("id, storage_path, before_path, poster_path, tenant_id")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle<{
          id: string;
          storage_path: string;
          before_path: string | null;
          poster_path: string | null;
          tenant_id: string;
        }>();

      if (!row) return apiNotFound("メディアが見つかりません。");

      const paths = [row.storage_path, row.before_path, row.poster_path].filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      );

      // DB 行の削除を先に行う (canonical state)。
      // 先に Storage を消すと、続く DB 削除が失敗した際に「DB には残っているが
      // 参照先 Storage が消えている」破綻状態が生まれ、公開/管理画面のレンダリング
      // を壊す。DB を真とし、Storage 削除は後段で best-effort 実行する。
      const { error: dbErr } = await admin
        .from("certificate_media")
        .delete()
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);

      if (dbErr) return apiInternalError(dbErr, "media delete");

      // Storage は best-effort: 失敗しても孤児ファイルが残るのみで、
      // ユーザー体験上は削除完了として扱う。
      if (paths.length > 0) {
        const { error: storageErr } = await admin.storage.from(CERTIFICATE_MEDIA_BUCKET).remove(paths);
        if (storageErr) {
          console.error("[media delete] storage remove error", storageErr);
        }
      }

      return apiOk({ deleted: true });
    } catch (e) {
      return apiInternalError(e, "media delete");
    }
  },
  { rateLimit: "general", permission: "certificates:edit", routeName: "media delete" },
);
