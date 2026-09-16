import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { posTerminalCaptureSchema } from "@/lib/validations/pos-capture";
import { captureTerminalPayment } from "@/lib/pos/terminalCapture";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（Connect対応） ───
// 記録の本体は @/lib/pos/terminalCapture（モバイルと共通）。
// 認証の**前**に IP で止める。ここを外すと、でたらめなトークンを投げるだけで
// auth.getUser() と membership の照会を無制限に走らせられる
export const POST = withCaller(
  async (req, { caller }) => {
    // IP に加えて利用者単位でも数える。IP だけだと店舗の NAT で全端末が
    // まとめて上限に当たり、**カードを切った直後に記録だけ弾かれる**
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
  },
  { minRole: "staff", rateLimit: "mobile_pos", routeName: "pos/terminal/capture" },
);
