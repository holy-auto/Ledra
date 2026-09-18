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

const profileSchema = z.object({
  permits: z
    .array(
      z.object({
        type: z.string().min(1),
        number: z.string().optional(),
        expires_at: z.string().optional(),
      }),
    )
    .optional(),
  mechanic_certifications: z
    .array(
      z.object({
        grade: z.string().min(1),
        holder_name: z.string().optional(),
        cert_number: z.string().optional(),
      }),
    )
    .optional(),
  has_lift: z.boolean().optional(),
  has_diagnostic_tools: z.boolean().optional(),
  has_adas_equipment: z.boolean().optional(),
  equipment_notes: z.string().nullable().optional(),
  ev_capable: z.boolean().optional(),
  body_work: z.boolean().optional(),
  painting: z.boolean().optional(),
  coating: z.boolean().optional(),
  ppf: z.boolean().optional(),
  electrical: z.boolean().optional(),
  mobile_service: z.boolean().optional(),
  supported_vehicles: z.array(z.string()).optional(),
  service_area: z
    .object({
      prefectures: z.array(z.string()).optional(),
      radius_km: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

/**
 * GET /api/manufacturer/field-test/workshop-profiles/[tenantId]
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ tenantId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const { tenantId } = await ctx.params;

  try {
    const admin = createServiceRoleAdmin("workshop profile detail");
    const { data, error } = await admin
      .from("workshop_capability_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return apiInternalError(error, "workshop profile GET");
    if (!data) return apiNotFound("プロファイルが見つかりません。");

    return apiJson({ profile: data });
  } catch (e) {
    return apiInternalError(e, "workshop profile GET");
  }
}

/**
 * PUT /api/manufacturer/field-test/workshop-profiles/[tenantId]
 *
 * Upsert workshop capability profile. Admin only.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ tenantId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin")
    return apiForbidden("プロファイル更新は admin ロールのみ実行できます。");

  const { tenantId } = await ctx.params;

  const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(
      parsed.error.issues[0]?.message ?? "入力に誤りがあります。",
    );
  }

  try {
    const admin = createServiceRoleAdmin("workshop profile upsert — admin");
    const { data, error } = await admin
      .from("workshop_capability_profiles")
      .upsert(
        {
          tenant_id: tenantId,
          ...parsed.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      )
      .select("*")
      .single();
    if (error) return apiInternalError(error, "workshop profile PUT");

    return apiJson({ profile: data });
  } catch (e) {
    return apiInternalError(e, "workshop profile PUT");
  }
}
