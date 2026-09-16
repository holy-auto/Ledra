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
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createRecruitmentSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1, "タイトルは必須です。").max(200),
  description: z.string().trim().max(5000).optional(),
  required_certifications: z.array(z.string().trim()).optional().default([]),
  max_participants: z.number().int().positive().optional(),
  deadline: z.string().datetime().optional(),
});

/**
 * GET /api/manufacturer/field-test/recruitments
 *
 * List recruitments. Required ?project_id filter.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft recruitments list — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_recruitments")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "ft recruitments GET");

    return apiJson({ recruitments: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft recruitments GET");
  }
}

/**
 * POST /api/manufacturer/field-test/recruitments
 *
 * Create a recruitment for a project. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("募集作成は admin ロールのみ実行できます。");

  const parsed = createRecruitmentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft recruitment create — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    // Verify the project belongs to this manufacturer
    const { data: project } = await admin
      .from("ft_projects")
      .select("id")
      .eq("id", parsed.data.project_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (!project) return apiValidationError("プロジェクトが見つかりません。");

    const { data, error } = await admin
      .from("ft_recruitments")
      .insert({
        manufacturer_id: manufacturerId,
        ...parsed.data,
        is_open: true,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft recruitments POST");

    return apiJson({ recruitment: data });
  } catch (e) {
    return apiInternalError(e, "ft recruitments POST");
  }
}
