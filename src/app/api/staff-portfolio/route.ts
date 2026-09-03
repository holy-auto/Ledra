import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { mergeStaffPortfolios, unlinkStaffPortfolio } from "@/lib/staff/portfolioLink";

export const dynamic = "force-dynamic";

/**
 * 職人本人が自分の実績リンクを束ねる／外す。
 *
 * 認証は**トークンの所持そのもの**。ログインを持たない職人が対象なので他に持ち物が無く、
 * トークンは 256bit なので総当たりは現実的でない。束ねるには **2本とも有効なトークンを
 * 持っている**必要があり、これが「他社に稼働先が見えない」を構造で守っている部分:
 * テナント側にはこの操作も、束ねた事実の表示も無い（20260903000001）。
 *
 * 失敗理由は出し分けない（存在しないトークンと失効したトークンを見分けさせない）。
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("merge"), token: z.string().min(1), other_token: z.string().min(1) }),
  z.object({ action: z.literal("unlink"), token: z.string().min(1), link_id: z.string().uuid() }),
]);

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("リクエストが不正です。");

    if (parsed.data.action === "merge") {
      // 貼り付けは URL 全体でも受ける（本人は /w/xxxx をそのままコピーしてくる）。
      const other = extractToken(parsed.data.other_token);
      const result = await mergeStaffPortfolios(parsed.data.token, other);
      if (!result.ok) {
        return apiValidationError(
          result.reason === "same"
            ? "同じリンクです。別の店舗のリンクを貼ってください。"
            : "そのリンクは使えません。有効なリンクか確認してください。",
        );
      }
      return apiJson({ ok: true });
    }

    const done = await unlinkStaffPortfolio(parsed.data.token, parsed.data.link_id);
    if (!done) return apiValidationError("解除できませんでした。");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "staff-portfolio POST");
  }
}

/** `https://…/w/<token>` でも生のトークンでも受け取れるようにする。 */
function extractToken(input: string): string {
  const s = input.trim();
  const m = s.match(/\/w\/([^/?#\s]+)/);
  return m ? m[1] : s;
}
