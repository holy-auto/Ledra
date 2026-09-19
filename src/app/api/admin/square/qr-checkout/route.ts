import { NextRequest } from "next/server";
import { z } from "zod";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getSquareContext, SquareApiError, SquareNotConnectedError } from "@/lib/square/client";
import { cancelTerminalCheckout, createTerminalQrCheckout, getTerminalCheckout } from "@/lib/square/qrCheckout";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  reference_id: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

function squareError(e: unknown) {
  if (e instanceof SquareNotConnectedError) {
    // `reason` はレジ側の分岐に使われる（"not_connected" だけが「記録だけ」に
    // 落としてよい状態。トークン切れ等をここに混ぜると、決済していないのに
    // 記録だけされて領収書が出る）。**reason を返さないと、その分岐が一生効かない。**
    const message =
      e.reason === "multiple_locations"
        ? "Square の店舗（ロケーション）が複数あり、どれを使うか決められません。サポートにご連絡ください。"
        : "Square が接続されていません。設定から接続してください。";
    return apiJson({ error: e.message, reason: e.reason, message }, { status: 409 });
  }
  if (e instanceof SquareApiError) {
    return apiJson({ error: "square_api_error", message: e.detail }, { status: 502 });
  }
  return null;
}

/**
 * POST: Square の端末にマルチブランド QR を出す（PayPay / d払い / 楽天ペイ /
 * au PAY / メルペイ / WeChat Pay / Alipay+）。
 *
 * 端末が繋がっていない店には `mode: "pos_app"` を返す —— Square の QR は
 * **対面決済専用**で、Square のアプリか端末でしか表示できない。その場合は
 * 店の Square アプリで会計してもらい、`/api/admin/pos/checkout` の
 * `square_reconcile` で Ledra に引き当てる。
 */
export async function POST(req: NextRequest) {
  // 認証の**前**に IP で止める。ここを外すと、でたらめなトークンを投げるだけで
  // auth.getUser() と membership の照会を無制限に走らせられる
  const ipLimited = await checkRateLimit(req, "mobile_pos");
  if (ipLimited) return ipLimited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // IP に加えて利用者単位でも数える。IP だけだと店舗の NAT で全端末が
    // まとめて上限に当たり、**会計を出した直後に別の店員の分だけ弾かれる**。
    // 併せて、ログイン・OTP 等と共有の "auth" バケット（10 req/60s・IP単位・
    // 常時フェイルクローズ）から外す —— 決済作成を認証系トラフィックと
    // 相乗りさせると、無関係な認証の混雑や Redis 障害時の 503 がそのまま
    // 会計不能に直結する（/code-review 指摘）。
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);

    if (!ctx.terminalDeviceId) {
      return apiOk({ mode: "pos_app" as const, checkout_id: null });
    }

    const checkout = await createTerminalQrCheckout({
      accessToken: ctx.accessToken,
      deviceId: ctx.terminalDeviceId,
      amountJpy: parsed.data.amount,
      // 端末側の二重表示を防ぐ。同じ会計をやり直しても Square 側は1件。
      // Square の idempotency_key には文字数上限があり（`ledra:` + UUID36 +
      // `:` + reference_id で最大83文字になっていた）、上限を超えた分は
      // 全件が 400 で落ちる。Square 側の冪等性はアクセストークン＝店舗単位で
      // スコープされるので、テナント接頭辞は無くても他店と衝突しない。
      // reference_id が空文字（省略を "" で表す API クライアント向け）だと
      // ?? では拾えず、Square に空の idempotency_key を送って落ちる（/code-review 指摘）
      idempotencyKey: parsed.data.reference_id || crypto.randomUUID(),
      referenceId: parsed.data.reference_id,
      note: parsed.data.note,
    });

    return apiOk({ mode: "terminal" as const, checkout_id: checkout.id, status: checkout.status });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout POST");
  }
}

/** GET: 端末のチェックアウト状態（会計画面のポーリング用）。 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiValidationError("invalid_id");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);
    const checkout = await getTerminalCheckout(ctx.accessToken, id);

    return apiOk({
      id: checkout.id,
      status: checkout.status,
      cancel_reason: checkout.cancel_reason ?? null,
      // 記録はサーバが Square から取り直して確かめる。ここでは進捗だけ返す
      paid: checkout.status === "COMPLETED",
    });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout GET");
  }
}

/**
 * DELETE: 会計をやめたときに端末の QR を消す。
 *
 * 残すと、**店員が現金会計に切り替えた後で客が QR を読んで二重に払える**。
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiValidationError("invalid_id");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);
    try {
      await cancelTerminalCheckout(ctx.accessToken, id);
    } catch (e) {
      // 既に完了・取消済みで取消を拒否された場合だけ許容する（やめた側の
      // 操作は止めない）。それ以外（認証切れ・レート制限・5xx 等）まで
      // 「取消できた」と返すと、**端末に QR が生きたまま**呼び出し側が
      // チェックアウトIDを捨てて次の会計に進み、二重決済や記帳漏れを生む。
      //
      // 推定: Square は「終端状態から CANCELED への遷移不可」を 400 で返す
      // （Square Developer Forum の報告に基づく。この環境からは Square API に
      // 到達できず未検証）。401/403/429 等の他の 4xx まで許容すると、
      // トークン切れやレート制限を「取消済み」と誤認する（/code-review 指摘）。
      if (!(e instanceof SquareApiError) || e.status !== 400) {
        return apiJson(
          {
            error: "square_cancel_failed",
            message: "端末の会計を取り消せませんでした。端末の画面を確認してください。",
          },
          { status: 502 },
        );
      }
      // 400（終端状態から遷移できない）は下の GET 確認へ続ける。
    }
    // Cancel Terminal Checkout の呼び出しが例外を投げなかった（2xx）としても、
    // それは「取消済み」ではなく「物理端末への取消要求を受け付けた」でしか
    // ない —— 端末との往復が要るため非同期で、`CANCEL_REQUESTED` のまま
    // 返ってくることがある（`TerminalCheckoutStatus` に別状態として既に
    // モデル化済み）。ここで確定させずに ok:true を返すと、呼び出し側は
    // キャンセル成功と判断してポーリングを止め、その隙に客が支払いを完了
    // させても誰も拾えなくなる（/code-review 指摘）。GET で実際の状態を
    // 確認してから返す。COMPLETED の扱いは400分岐と同じ理由で必要
    // （客がキャンセル直前に支払い終えたケースを区別する）。
    const checkout = await getTerminalCheckout(ctx.accessToken, id);
    if (checkout.status === "COMPLETED") {
      return apiJson(
        {
          error: "square_already_completed",
          message: "取消の直前に決済が完了しました。記帳のため会計を続けてください。",
          checkout_id: id,
        },
        { status: 409 },
      );
    }
    if (checkout.status !== "CANCELED") {
      // まだ CANCEL_REQUESTED 等。呼び出し側は「取消未確認」として扱い、
      // チェックアウトIDを保持したまま再試行できるようにする。
      return apiJson(
        {
          error: "square_cancel_pending",
          message: "端末の取消をまだ確認できませんでした。少し待ってから再試行してください。",
        },
        { status: 502 },
      );
    }
    return apiOk({ ok: true });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout DELETE");
  }
}
