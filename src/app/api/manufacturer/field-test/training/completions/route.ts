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

const createSchema = z.object({
  module_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

/**
 * GET /api/manufacturer/field-test/training/completions?project_id=xxx&module_id=yyy
 *
 * List training completions. Joins tenant name + module title.
 * Filter by project_id (via module join) or module_id directly.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const moduleId = url.searchParams.get("module_id");

  try {
    const admin = createServiceRoleAdmin("ft training completions list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_training_completions")
      .select("*, tenants(name), ft_training_modules(title, project_id, manufacturer_id)")
      .order("completed_at", { ascending: false });

    if (moduleId) {
      query = query.eq("module_id", moduleId);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft training completions GET");

    // Filter to this manufacturer via the joined module's manufacturer_id,
    // and optionally by project_id
    const completions = (data ?? [])
      .filter((row: Record<string, unknown>) => {
        const mod = row.ft_training_modules as { manufacturer_id: string; project_id: string } | null;
        if (!mod || mod.manufacturer_id !== manufacturerId) return false;
        if (projectId && mod.project_id !== projectId) return false;
        return true;
      })
      .map((row: Record<string, unknown>) => {
        const tenants = row.tenants as { name: string | null } | null;
        const mod = row.ft_training_modules as { title: string; project_id: string } | null;
        return {
          ...row,
          tenant_name: tenants?.name ?? null,
          module_title: mod?.title ?? null,
          tenants: undefined,
          ft_training_modules: undefined,
        };
      });

    return apiJson({ completions });
  } catch (e) {
    return apiInternalError(e, "ft training completions GET");
  }
}

/**
 * POST /api/manufacturer/field-test/training/completions
 *
 * Record a training completion on behalf of a tenant. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("研修完了記録は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft training completion create — admin caller");
    const manufacturerId = caller.manufacturerId;

    // Verify the module belongs to this manufacturer
    const { data: mod } = await admin
      .from("ft_training_modules")
      .select("id")
      .eq("id", parsed.data.module_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (!mod) {
      return apiValidationError("指定の研修モジュールが見つかりません。");
    }

    const { data, error } = await admin
      .from("ft_training_completions")
      .insert({
        module_id: parsed.data.module_id,
        tenant_id: parsed.data.tenant_id,
        completed_by: caller.userId,
        completed_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft training completion POST");

    return apiJson({ completion: data });
  } catch (e) {
    return apiInternalError(e, "ft training completion POST");
  }
}
