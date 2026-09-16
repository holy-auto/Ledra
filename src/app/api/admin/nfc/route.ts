import { z } from "zod";

import { apiJson, apiValidationError, apiNotFound, apiError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

import { withCaller } from "@/lib/api/withCaller";
const nfcRetireSchema = z.object({
  id: z.string().uuid("NFC タグ ID の形式が不正です。"),
});

/**
 * PATCH /api/admin/nfc — 論理削除（status → retired）
 */
export const PATCH = withCaller(
  async (request, { caller, supabase }) => {
    const parsed = await parseJsonBody(request, nfcRetireSchema);
    if (!parsed.ok) return parsed.response;
    const { id } = parsed.data;

    const { data: tag, error: findErr } = await supabase
      .from("nfc_tags")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (findErr || !tag) {
      return apiNotFound("NFCタグが見つかりません。");
    }

    if (tag.status === "retired") {
      return apiValidationError("このタグは既に廃止されています。");
    }

    const { error: updateErr } = await supabase
      .from("nfc_tags")
      .update({ status: "retired" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (updateErr) {
      return apiError({ code: "db_error", message: "更新に失敗しました。", status: 500 });
    }

    return apiJson({ ok: true });
  },
  { permission: "vehicles:edit", routeName: "admin/nfc PATCH" },
);

/**
 * DELETE /api/admin/nfc — 物理削除（admin/owner のみ）
 */
export const DELETE = withCaller(
  async (request, { caller, supabase }) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return apiValidationError("タグIDが必要です。");
    }

    const { data: tag, error: findErr } = await supabase
      .from("nfc_tags")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (findErr || !tag) {
      return apiNotFound("NFCタグが見つかりません。");
    }

    const { error: delErr } = await supabase.from("nfc_tags").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (delErr) {
      return apiError({ code: "db_error", message: "削除に失敗しました。", status: 500 });
    }

    return apiJson({ ok: true });
  },
  { minRole: "admin", routeName: "admin/nfc DELETE" },
);
