/**
 * POST /api/parts/confirmations — 確定依頼（店スタッフ）。
 *
 * 装着レコードに対し、保証グレード/チャンネルを決定して pending 署名を作成し、
 * 顧客本人の携帯へ送る確定リンク＋OTP を発行する（送信は通知基盤に委譲）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { requestConfirmation } from "@/lib/parts/confirmationService";

export const dynamic = "force-dynamic";

const schema = z.object({
  installation_id: z.string().uuid(),
  in_store_tablet: z.boolean().optional(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError("入力内容を確認してください。", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  try {
    const result = await requestConfirmation(caller.tenantId, parsed.data.installation_id, {
      inStoreTablet: parsed.data.in_store_tablet,
    });
    const origin = new URL(req.url).origin;
    return apiJson({ ...result, confirm_url: `${origin}/parts/confirm/${result.token}` }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/confirmations POST");
  }
}
