import { NextRequest } from "next/server";
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { getWorkshopProfile, upsertWorkshopProfile } from "@/lib/fieldTest/tenantQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  permits: z
    .array(z.object({ type: z.string().min(1), number: z.string().optional(), expires_at: z.string().optional() }))
    .optional(),
  mechanic_certifications: z
    .array(z.object({ grade: z.string().min(1), holder_name: z.string().optional(), cert_number: z.string().optional() }))
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
    .object({ prefectures: z.array(z.string()).optional(), radius_km: z.number().nonnegative().optional(), notes: z.string().optional() })
    .optional(),
});

/** GET /api/admin/field-test/workshop-profile */
export const GET = withCaller(
  async (_req: NextRequest, { caller, supabase }) => {
    const profile = await getWorkshopProfile(supabase, caller.tenantId);
    return apiJson({ profile });
  },
  { routeName: "ft workshop-profile GET" },
);

/** PUT /api/admin/field-test/workshop-profile */
export const PUT = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const profile = await upsertWorkshopProfile(supabase, caller.tenantId, parsed.data);
    return apiJson({ profile });
  },
  { routeName: "ft workshop-profile PUT" },
);
