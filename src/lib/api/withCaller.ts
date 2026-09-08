/**
 * F-1（PR-5 重複圧縮）: route.ts の定型ボイラープレートを1本にまとめる。
 *
 *   client 生成 → resolveCallerWithRole → 401 → (任意) レート制限 →
 *   (任意) ロール/権限チェック → 403 → try/catch → apiInternalError
 *
 * が 648 本の route.ts にコピーされている（`resolveCallerWithRole` 463
 * importer、`apiUnauthorized` 702 箇所、`apiInternalError` 1,618 箇所 —
 * 監査時点の実測）。既存ルートを一括で置き換えると変更範囲が全 route.ts に
 * 及び検証しきれないため、**新規ルートから使う**方針（既存ルートは移行しない）。
 *
 * @example
 *   export const POST = withCaller(
 *     async (req, { caller, supabase }) => {
 *       // caller.tenantId / caller.role / caller.userId が使える
 *       return apiOk({ ok: true });
 *     },
 *     { permission: "certificates:edit", rateLimit: "general" },
 *   );
 *
 * 動的ルート（`[id]` 等）では第2型引数で params の形を渡す:
 *   export const DELETE = withCaller<{ id: string }>(
 *     async (req, { caller, supabase, params }) => { ... },
 *     { minRole: "admin" },
 *   );
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole, requirePermission, type CallerInfo } from "@/lib/auth/checkRole";
import type { Role } from "@/lib/auth/roles";
import type { Permission } from "@/lib/auth/permissions";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, type RateLimitPreset } from "@/lib/api/rateLimit";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CallerRouteContext<P = undefined> = P extends undefined
  ? { caller: CallerInfo; supabase: Supabase }
  : { caller: CallerInfo; supabase: Supabase; params: P };

type CallerRouteHandler<P> = (req: NextRequest, ctx: CallerRouteContext<P>) => Promise<Response>;

export type WithCallerOptions = {
  /** 最低ロール（`hasMinRole` で判定）。permission と併用可、両方満たす必要がある。 */
  minRole?: Role;
  /** 権限キー（`hasPermission` で判定）。 */
  permission?: Permission;
  /** 先頭で `checkRateLimit(req, preset)` を通す。省略時はレート制限しない。 */
  rateLimit?: RateLimitPreset;
};

/**
 * 認証必須ルート用ハンドララッパ。caller 解決・401・任意のレート制限・
 * ロール/権限チェック・try/catch → apiInternalError を1箇所に集約する。
 *
 * 動的ルートの `{ params }` はそのまま渡ってきた `Promise<P>` を await して
 * `ctx.params` として渡す。静的ルート（params 無し）では `P` を省略する。
 */
export function withCaller<P = undefined>(handler: CallerRouteHandler<P>, options: WithCallerOptions = {}) {
  return async (
    req: NextRequest,
    routeCtx?: P extends undefined ? undefined : { params: Promise<P> },
  ): Promise<Response> => {
    try {
      if (options.rateLimit) {
        const limited = await checkRateLimit(req, options.rateLimit);
        if (limited) return limited;
      }

      const supabase = await createSupabaseServerClient();
      const caller = await resolveCallerWithRole(supabase);
      if (!caller) return apiUnauthorized();

      if (options.minRole && !requireMinRole(caller, options.minRole)) return apiForbidden();
      if (options.permission && !requirePermission(caller, options.permission)) return apiForbidden();

      const params = routeCtx ? await routeCtx.params : undefined;
      const ctx = (params !== undefined ? { caller, supabase, params } : { caller, supabase }) as CallerRouteContext<P>;

      return await handler(req, ctx);
    } catch (e) {
      return apiInternalError(e, "withCaller");
    }
  };
}
