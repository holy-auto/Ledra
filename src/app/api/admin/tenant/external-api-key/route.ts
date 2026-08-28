import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { requireAal2OrResponse } from "@/lib/auth/stepUpGuard";
import { getExternalApiKeyStatus, writeExternalApiKey } from "@/lib/security/tenantPrivateSecrets";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
  apiOk,
} from "@/lib/api/response";

/**
 * テナントの外部APIキー（tenant_private_secrets にハッシュ保存）管理エンドポイント。
 *
 *   GET    … ステータスとマスク済みプレビュー（末尾4文字）を返す。平文は返さない。
 *   POST { action: "issue" }   … 新規発行（既存キーは上書き）。平文をこのレスポンスだけで一度返す。
 *   POST { action: "revoke" }  … キーを無効化（NULL に戻す）。
 *
 * このキーは NexPTG 連携 (/api/external/nexptg/sync) と
 * 外部予約 (/api/external/booking) の両方で x-api-key として検証される。
 */

const KEY_PREFIX = "nex_";

const externalApiKeyActionSchema = z.object({
  action: z.enum(["issue", "revoke"], { message: "action must be 'issue' or 'revoke'" }),
});

function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

function maskKey(last4: string): string {
  return KEY_PREFIX + "****" + last4;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:view")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const status = await getExternalApiKeyStatus(admin, caller.tenantId);
    return apiJson({
      status: status.active ? "active" : "not_set",
      masked: status.active && status.last4 ? maskKey(status.last4) : null,
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
    const stepUpDenied = await requireAal2OrResponse(supabase);
    if (stepUpDenied) return stepUpDenied;

    const parsed = externalApiKeyActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { action } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (action === "issue") {
      const newKey = generateApiKey();
      await writeExternalApiKey(admin, caller.tenantId, newKey);

      // 平文キーはこのレスポンスでのみ返す（再取得不可）
      return apiOk({ key: newKey, masked: maskKey(newKey.slice(-4)) });
    }

    // action === "revoke"
    await writeExternalApiKey(admin, caller.tenantId, null);
    return apiOk({ status: "not_set" });
  } catch (e) {
    return apiInternalError(e, "external-api-key POST");
  }
}
