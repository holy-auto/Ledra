import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
  apiOk,
} from "@/lib/api/response";

/**
 * テナントの外部APIキー（tenants.external_api_key）管理エンドポイント。
 *
 *   GET    … ステータスとマスク済みプレビュー（末尾4文字）を返す。平文は返さない。
 *   POST { action: "issue" }   … 新規発行（既存キーは上書き）。平文をこのレスポンスだけで一度返す。
 *   POST { action: "revoke" }  … キーを無効化（NULL に戻す）。
 *
 * このキーは NexPTG 連携 (/api/external/nexptg/sync) と
 * 外部予約 (/api/external/booking) の両方で x-api-key として検証される。
 */

const KEY_PREFIX = "nex_";

function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

function maskKey(key: string): string {
  if (key.length <= 8) return KEY_PREFIX + "****";
  return KEY_PREFIX + "****" + key.slice(-4);
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:view")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin.from("tenants").select("external_api_key").eq("id", caller.tenantId).single();

    if (error) return apiInternalError(error, "external-api-key GET");

    const key = (data?.external_api_key as string | null) ?? null;
    return apiJson({
      status: key ? "active" : "not_set",
      masked: key ? maskKey(key) : null,
    });
  } catch (e) {
    return apiInternalError(e, "external-api-key GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const body = (await req.json().catch((): null => null)) as { action?: string } | null;
    const action = body?.action;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (action === "issue") {
      const newKey = generateApiKey();
      const { error } = await admin.from("tenants").update({ external_api_key: newKey }).eq("id", caller.tenantId);

      if (error) return apiInternalError(error, "external-api-key issue");

      // 平文キーはこのレスポンスでのみ返す（再取得不可）
      return apiOk({ key: newKey, masked: maskKey(newKey) });
    }

    if (action === "revoke") {
      const { error } = await admin.from("tenants").update({ external_api_key: null }).eq("id", caller.tenantId);

      if (error) return apiInternalError(error, "external-api-key revoke");
      return apiOk({ status: "not_set" });
    }

    return apiValidationError("action must be 'issue' or 'revoke'");
  } catch (e) {
    return apiInternalError(e, "external-api-key POST");
  }
}
