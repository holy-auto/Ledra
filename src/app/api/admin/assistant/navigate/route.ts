/**
 * POST /api/admin/assistant/navigate
 * ナビゲーション補助（自然文 → 開く画面 href、または特定エンティティの検索）。
 *
 * ナビ補助は低コストかつ全プランで有用なため、ハードなプラン制限は設けない
 * （モデルのみプラン別: Starter=Haiku）。到達先ページのアクセス制御は
 * AdminRouteGuard が担保する。エンティティ検索（顧客/車両/証明書/請求書）は
 * 顧客データに触れるため、既存のグローバル検索と同じ staff 以上に限定する。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { resolveOrgUserContext } from "@/lib/auth/orgAccess";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { resolveNavIntent } from "@/lib/ai/navIntent";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { searchEntities, entityResultsToChips, type EntityChip } from "@/lib/search/entities";
import { ADMIN_NAV_LABELS } from "@/components/ui/adminNav";

const bodySchema = z.object({
  query: z.string().trim().min(1, "検索する内容を入力してください").max(500),
});

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    // 本社専用ユーザ（tenant membership 無し）はナビ限定で許可する。共有 admin レイアウトが
    // アシスタント入口を出すため、401 で「AI 利用不可」と誤表示させない。エンティティ検索は
    // tenant データに触れるため下でガードして対象外にする。それ以外の未認証は 401。
    const orgCtx = caller ? null : await resolveOrgUserContext(supabase);
    if (!caller && !orgCtx) return apiUnauthorized();
    const userId = caller?.userId ?? orgCtx!.userId;

    // 毎リクエストが Anthropic 呼び出しに達するため、ユーザ単位で AI レート
    // リミットを掛けて課金爆発・暴走を防ぐ（ハードなプラン制限は無いが低コスト上限は掛ける）。
    const limited = await checkRateLimit(req, "ai", `assistant-navigate:${userId}`);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const intent = await resolveNavIntent(parsed.data.query, {
      // 本社専用ユーザは plan tier が無いため既定（高速/低コストモデル）にフォールバック。
      model: fastModelForPlanTier(caller?.planTier),
    });

    // 画面遷移が確定していればそれを返す（label はサーバで確定）。
    if (intent.href) {
      const alternatives: EntityChip[] = intent.alternatives.map((h) => ({
        href: h,
        label: ADMIN_NAV_LABELS[h] ?? h,
      }));
      return apiOk({ href: intent.href, reply: intent.reply, alternatives });
    }

    // エンティティ検索の意図: 顧客/車両/証明書/請求書を名前・番号で探す。
    // tenant データに触れるため、本社専用ユーザ（caller 無し）と staff 未満は不可。
    if (intent.searchQuery) {
      if (!caller || !requireMinRole(caller, "staff")) {
        return apiOk({
          href: null,
          reply: "検索の権限がありません。担当者にご確認ください。",
          alternatives: [] as EntityChip[],
        });
      }
      const results = await searchEntities(caller.tenantId, intent.searchQuery, 6);
      const chips = entityResultsToChips(results);
      if (chips.length === 1) {
        // 単一ヒットは即遷移。
        return apiOk({
          href: chips[0].href,
          reply: `${chips[0].label} を開きます。`,
          alternatives: [] as EntityChip[],
        });
      }
      if (chips.length === 0) {
        return apiOk({
          href: null,
          reply: `「${intent.searchQuery}」に一致する顧客・車両・証明書・請求書は見つかりませんでした。`,
          alternatives: [] as EntityChip[],
        });
      }
      return apiOk({
        href: null,
        reply: intent.reply || `「${intent.searchQuery}」の検索結果です。`,
        alternatives: chips.slice(0, 8),
      });
    }

    // 画面もエンティティも確定せず: 画面候補（あれば）を返し、UI 側の静的フィルタに委ねる。
    const alternatives: EntityChip[] = intent.alternatives.map((h) => ({
      href: h,
      label: ADMIN_NAV_LABELS[h] ?? h,
    }));
    return apiOk({ href: null, reply: intent.reply, alternatives });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
