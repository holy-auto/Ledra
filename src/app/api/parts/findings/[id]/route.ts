/**
 * POST /api/parts/findings/[id] — 検知(finding)の対応状態を更新（運用トリアージ）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L7
 * RLS(my_tenant_ids) でテナント越えは自動遮断。status のみ更新可能。
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "dismissed"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiValidationError("status が不正です。");

  try {
    const { data, error } = await supabase
      .from("part_integrity_findings")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return apiJson({ error: "not_found" }, { status: 404 });
    return apiJson({ id: data.id, status: data.status });
  } catch (e) {
    return apiInternalError(e, "parts/findings/[id] POST");
  }
}
