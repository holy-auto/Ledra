import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  project_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  agreement_type: z.enum(["nda", "terms", "other"]),
  document_url: z.string().url().max(2048).optional(),
  document_text: z.string().max(50000).optional(),
});

/**
 * GET /api/manufacturer/field-test/agreements?project_id=xxx
 *
 * List field-test agreements filtered by project_id.
 * Joins tenant name for display.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const projectId = new URL(req.url).searchParams.get("project_id");

  try {
    const admin = createServiceRoleAdmin("ft agreements list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_agreements")
      .select("*, tenants(name)")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft agreements GET");

    const agreements = (data ?? []).map((row: Record<string, unknown>) => {
      const tenants = row.tenants as { name: string | null } | null;
      return { ...row, tenant_name: tenants?.name ?? null, tenants: undefined };
    });

    return apiJson({ agreements });
  } catch (e) {
    return apiInternalError(e, "ft agreements GET");
  }
}

/**
 * POST /api/manufacturer/field-test/agreements
 *
 * Create a new field-test agreement. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("契約管理は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft agreements create — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_agreements")
      .insert({
        manufacturer_id: manufacturerId,
        project_id: parsed.data.project_id,
        tenant_id: parsed.data.tenant_id,
        agreement_type: parsed.data.agreement_type,
        document_url: parsed.data.document_url ?? null,
        document_text: parsed.data.document_text ?? null,
        accepted: false,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft agreements POST");

    return apiJson({ agreement: data });
  } catch (e) {
    return apiInternalError(e, "ft agreements POST");
  }
}
