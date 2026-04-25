import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { apiJson, apiUnauthorized, apiValidationError, apiForbidden, apiInternalError } from "@/lib/api/response";

const contextSwitchSchema = z.object({
  context: z.enum(["shop", "agent"], {
    message: "context は 'shop' または 'agent' を指定してください",
  }),
});

export const runtime = "nodejs";

const ACTIVE_CONTEXT_COOKIE = "active_context";
const ACTIVE_TENANT_COOKIE = "active_tenant_id";

/**
 * GET /api/auth/context
 *
 * ログイン中ユーザーが持つロールコンテキストを返す。
 * - has_shop: 施工店テナントに所属しているか
 * - has_agent: agents テーブルに user_id で紐付いているか
 * - active_context: 現在のアクティブコンテキスト（Cookie から読む）
 * - tenant_id: 施工店モード時の対象テナント
 * - agent_id: 代理店 ID
 * - agent_status: 代理店ステータス
 */
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiUnauthorized();
  }

  // get_my_user_contexts() RPC でまとめて取得
  const { data: ctx, error } = await supabase.rpc("get_my_user_contexts");
  if (error) {
    return apiInternalError(error, "auth/context rpc");
  }

  // 現在のアクティブコンテキスト Cookie を読む
  const cookieStore = await cookies();
  const activeContext = cookieStore.get(ACTIVE_CONTEXT_COOKIE)?.value ?? null;

  return apiJson({
    has_shop: ctx?.has_shop ?? false,
    has_agent: ctx?.has_agent ?? false,
    active_context: activeContext,
    tenant_id: ctx?.tenant_id ?? null,
    agent_id: ctx?.agent_id ?? null,
    agent_name: ctx?.agent_name ?? null,
    agent_status: ctx?.agent_status ?? null,
  });
}

/**
 * POST /api/auth/context
 *
 * アクティブコンテキストを切り替える。
 * Body: { context: "shop" | "agent" }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiUnauthorized();
  }

  const parsed = contextSwitchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const newContext = parsed.data.context;

  // ユーザーがそのコンテキストの権限を持っているか確認
  const { data: ctx } = await supabase.rpc("get_my_user_contexts");

  if (newContext === "shop" && !ctx?.has_shop) {
    return apiForbidden("施工店アカウントに紐付いていません");
  }
  if (newContext === "agent" && !ctx?.has_agent) {
    return apiForbidden("代理店アカウントに紐付いていません");
  }

  // Cookie にセット（HttpOnly, SameSite=Lax）
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CONTEXT_COOKIE, newContext, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });

  // 施工店モードの場合は tenant_id も Cookie にセット
  if (newContext === "shop" && ctx?.tenant_id) {
    cookieStore.set(ACTIVE_TENANT_COOKIE, ctx.tenant_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const redirectTo = newContext === "agent" ? "/agent" : "/dashboard";

  return apiJson({ ok: true, context: newContext, redirect_to: redirectTo });
}
