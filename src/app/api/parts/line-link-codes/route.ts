/**
 * POST /api/parts/line-link-codes — 顧客LINE連携コードの発行（店スタッフ）。
 *
 * 返した code を顧客へ提示し、顧客が LINE 公式アカウントへ送信すると紐付く。
 * 設計: docs/parts-installation-integrity-design.md §6.4.2
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole, requirePermission } from "@/lib/auth/checkRole";
import { generateCustomerLinkCode } from "@/lib/line/linkCode";

export const dynamic = "force-dynamic";

const schema = z.object({ customer_id: z.string().uuid() });

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  // 連携コード発行 = 本人確認に関わる書き込み操作。閲覧のみのユーザーには許可しない。
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  // 連携コードは顧客の通知チャネルを書き換える credential なので、閲覧のみの
  // ロール（viewer 等）には発行させない。customers:edit 権限を必須にする。
  if (!requirePermission(caller, "customers:edit")) return apiForbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiValidationError("customer_id が不正です。");

  // 顧客が自テナントのものか確認（RLS スコープの server client で存在確認）。
  // すでに LINE 連携済みなら再発行を弾く（別アカウントへの付け替え防止）。
  const { data: cust } = await supabase
    .from("customers")
    .select("id, line_user_id")
    .eq("id", parsed.data.customer_id)
    .maybeSingle();
  if (!cust) return apiJson({ error: "not_found" }, { status: 404 });
  if (cust.line_user_id) {
    return apiJson({ error: "already_linked", message: "このお客様はすでにLINE連携済みです。" }, { status: 409 });
  }

  // LINE 未連携テナントでコードを発行しても無意味なので弾く。
  const { data: tenant } = await supabase
    .from("tenants")
    .select("line_enabled")
    .eq("id", caller.tenantId)
    .maybeSingle();
  if (!tenant?.line_enabled) {
    return apiJson({ error: "line_disabled", message: "LINE公式アカウントが未連携です。" }, { status: 409 });
  }

  try {
    const result = await generateCustomerLinkCode(caller.tenantId, parsed.data.customer_id, caller.userId);
    return apiJson(result, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/line-link-codes POST");
  }
}
