import { NextRequest } from "next/server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { posTerminalCaptureSchema } from "@/lib/validations/pos-capture";
import { captureTerminalPayment } from "@/lib/pos/terminalCapture";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（Connect対応） ───
// 記録の本体は @/lib/pos/terminalCapture（モバイルと共通）。
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // 利用者単位で数える。IP 単位だと店舗の NAT で全端末がまとめて上限に当たり、
    // **カードを切った直後に記録だけ弾かれる**（＝二重請求の入口）
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const parsed = posTerminalCaptureSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    if (!parsed.data.payment_intent_id.startsWith("pi_")) {
      return apiValidationError("invalid_payment_intent_id");
    }

    const res = await captureTerminalPayment(caller, parsed.data);
    if (!res.ok) {
      return res.kind === "validation"
        ? apiValidationError(res.error)
        : apiInternalError(res.error, "pos/terminal/capture");
    }
    return apiJson(res);
  } catch (e: unknown) {
    return apiInternalError(e, "pos/terminal/capture");
  }
}
