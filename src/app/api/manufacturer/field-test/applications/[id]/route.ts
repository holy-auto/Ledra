import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewApplicationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  review_notes: z.string().trim().max(2000).optional(),
});

/**
 * PATCH /api/manufacturer/field-test/applications/[id]
 *
 * Review an application (approve / reject). Admin only.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("申請審査は admin ロールのみ実行できます。");

  const { id } = await ctx.params;

  const parsed = reviewApplicationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft application review — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_applications")
      .update({
        status: parsed.data.status,
        review_notes: parsed.data.review_notes ?? null,
        reviewed_by: caller.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .eq("status", "pending") // Only pending applications can be reviewed
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("審査対象の申請が見つかりません（既に審査済みか、別メーカーの申請の可能性があります）。");
      }
      return apiInternalError(error, "ft application PATCH");
    }

    return apiJson({ application: data });
  } catch (e) {
    return apiInternalError(e, "ft application PATCH");
  }
}
