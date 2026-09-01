import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { requireMinRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

const nfcRetireSchema = z.object({
  id: z.string().uuid("NFC タグ ID の形式が不正です。"),
});

/**
 * PATCH /api/admin/nfc — 論理削除（status → retired）
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requirePermission(caller, "vehicles:edit")) return apiForbidden();

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
}

/**
 * DELETE /api/admin/nfc — 物理削除（admin/owner のみ）
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  if (!requireMinRole(caller, "admin")) {
    return apiForbidden("NFCタグの完全削除には管理者権限が必要です。");
  }

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
}
