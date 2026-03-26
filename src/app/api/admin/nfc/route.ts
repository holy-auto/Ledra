import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { enforceBilling } from "@/lib/billing/guard";

/**
 * PATCH /api/admin/nfc — 論理削除（status → retired）
 */
export async function PATCH(request: NextRequest) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const billing = await enforceBilling(request, { minPlan: "starter" });
  if (billing) return billing;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  if (!body.id) {
    return apiValidationError("タグIDが必要です。");
  }

  const { data: tag, error: findErr } = await supabase
    .from("nfc_tags")
    .select("id, status")
    .eq("id", body.id)
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
    .eq("id", body.id)
    .eq("tenant_id", caller.tenantId);

  if (updateErr) {
    return apiError({ code: "db_error", message: "更新に失敗しました。", status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/nfc — 物理削除（admin/owner のみ）
 */
export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  if (!requireMinRole(caller, "admin")) {
    return apiForbidden("NFCタグの完全削除には管理者権限が必要です。");
  }

  const billing = await enforceBilling(request, { minPlan: "starter" });
  if (billing) return billing;

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

  const { error: delErr } = await supabase
    .from("nfc_tags")
    .delete()
    .eq("id", id)
    .eq("tenant_id", caller.tenantId);

  if (delErr) {
    return apiError({ code: "db_error", message: "削除に失敗しました。", status: 500 });
  }

  return NextResponse.json({ ok: true });
}
