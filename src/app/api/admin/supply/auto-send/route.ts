/**
 * 店舗向け: 供給パートナー発注の全自動送信 (opt-in) 設定。
 *
 * 壁3 隣接機能のため、有効化には enabled + 1発注上限 + 月次上限 がすべて必要
 * (上限未設定なら自動送信されない)。さらに対象は「API・ポータル連携済み」の提携先に
 * 限られる (これは発注時に判定)。金額上限を安全の核とし、運営の信頼承認は要件としない。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateSchema = z.object({
  enabled: z.boolean(),
  max_order_jpy: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  monthly_cap_jpy: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase
      .from("tenant_supply_auto_send_settings")
      .select("enabled, max_order_jpy, monthly_cap_jpy")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (error) return apiInternalError(error, "supply auto-send get");

    return apiJson({
      ok: true,
      settings: data ?? { enabled: false, max_order_jpy: null, monthly_cap_jpy: null },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "supply auto-send get");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("自動送信の設定は管理者のみ変更できます。");
    }

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { enabled, max_order_jpy, monthly_cap_jpy } = parsed.data;

    const { error } = await supabase.from("tenant_supply_auto_send_settings").upsert(
      {
        tenant_id: caller.tenantId,
        enabled,
        max_order_jpy: max_order_jpy ?? null,
        monthly_cap_jpy: monthly_cap_jpy ?? null,
        updated_by: caller.userId,
      },
      { onConflict: "tenant_id" },
    );
    if (error) return apiInternalError(error, "supply auto-send update");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supply auto-send update");
  }
}
