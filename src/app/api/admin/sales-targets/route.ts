import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  year_month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM 形式で指定してください"),
  // 上限は 1 兆円（実質無制限だが暴発を防ぐ）。
  target_amount: z.coerce.number().int().min(0).max(1_000_000_000_000),
});

// GET: 保存済みの月次目標（直近 24 件）+ 当月の進捗（目標/実績/達成率）
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const [targetsRes, progressRes] = await Promise.all([
      supabase
        .from("sales_targets")
        .select("year_month, target_amount")
        .eq("tenant_id", caller.tenantId)
        .order("year_month", { ascending: false })
        .limit(24),
      supabase.rpc("sales_target_progress", { p_tenant_id: caller.tenantId }),
    ]);

    if (targetsRes.error) return apiInternalError(targetsRes.error, "sales-targets");

    return apiJson({
      targets: targetsRes.data ?? [],
      progress: progressRes.data ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "sales-targets");
  }
}

// PUT: 1 ヶ月分の目標を upsert
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { year_month, target_amount } = parsed.data;
    const { error } = await supabase.from("sales_targets").upsert(
      {
        tenant_id: caller.tenantId,
        year_month,
        target_amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,year_month" },
    );
    if (error) return apiInternalError(error, "sales-targets");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "sales-targets");
  }
}
