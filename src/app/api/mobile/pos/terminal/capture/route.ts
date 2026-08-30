import { NextRequest } from "next/server";

import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posTerminalCaptureSchema } from "@/lib/validations/pos";
import { captureTerminalPayment } from "@/lib/pos/terminalCapture";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（モバイルアプリ用） ───
// 記録の本体は @/lib/pos/terminalCapture（管理画面と共通）。
export async function POST(req: NextRequest) {
  // 認証の**前**に IP で止める。ここを外すと、でたらめなトークンを投げるだけで
  // auth.getUser() と membership の照会を無制限に走らせられる
  const ipLimited = await checkRateLimit(req, "mobile_pos");
  if (ipLimited) return ipLimited;

  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // IP に加えて利用者単位でも数える。IP だけだと店舗の NAT で全端末が
    // まとめて上限に当たり、**カードを切った直後に記録だけ弾かれる**
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const parsed = posTerminalCaptureSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const res = await captureTerminalPayment(caller, parsed.data);
    if (!res.ok) {
      return res.kind === "validation"
        ? apiValidationError(res.error)
        : apiInternalError(res.error, "mobile/pos/terminal/capture");
    }
    return apiJson(res);
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/terminal/capture");
  }
}
