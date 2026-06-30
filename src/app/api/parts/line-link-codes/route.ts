/**
 * POST /api/parts/line-link-codes — 顧客LINE連携コードの発行（店スタッフ）。
 *
 * 返した code を顧客へ提示し、顧客が LINE 公式アカウントへ送信すると紐付く。
 * 設計: docs/parts-installation-integrity-design.md §6.4.2
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { generateCustomerLinkCode } from "@/lib/line/linkCode";

export const dynamic = "force-dynamic";

const schema = z.object({ customer_id: z.string().uuid() });

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  // 連携コード発行 = 本人確認に関わる書き込み操作。閲覧のみのユーザーには許可しない。
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiValidationError("customer_id が不正です。");

  // 顧客が自テナントのものか確認（RLS スコープの server client で存在確認）
  const { data: cust } = await supabase.from("customers").select("id").eq("id", parsed.data.customer_id).maybeSingle();
  if (!cust) return apiJson({ error: "not_found" }, { status: 404 });

  try {
    const result = await generateCustomerLinkCode(caller.tenantId, parsed.data.customer_id, caller.userId);
    return apiJson(result, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/line-link-codes POST");
  }
}
