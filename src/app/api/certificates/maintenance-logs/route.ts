import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

const createSchema = z.object({
  public_id: z.string().trim().min(1, "public_id は必須です。").max(100),
  performed_at: z.string().trim().min(1, "実施日時を入力してください。"),
  content: z.string().trim().min(1, "メンテナンス内容を入力してください。").max(5000),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const performedAt = new Date(parsed.data.performed_at);
    if (Number.isNaN(performedAt.getTime())) {
      return apiValidationError("実施日時の形式が不正です。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: cert, error: fetchError } = await admin
      .from("certificates")
      .select("id")
      .eq("public_id", parsed.data.public_id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (fetchError || !cert) return apiNotFound("証明書が見つかりません。");

    const { data: inserted, error: insertError } = await admin
      .from("certificate_maintenance_logs")
      .insert({
        certificate_id: cert.id,
        tenant_id: caller.tenantId,
        performed_at: performedAt.toISOString(),
        content: parsed.data.content.trim(),
        performed_by: caller.userId,
      })
      .select("id, performed_at, content, performed_by, created_at")
      .single();

    if (insertError || !inserted) {
      return apiInternalError(insertError, "maintenance log insert");
    }

    return apiOk({ log: inserted });
  } catch (e) {
    return apiInternalError(e, "maintenance log create");
  }
}
