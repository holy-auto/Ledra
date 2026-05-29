/**
 * POST /api/admin/master-data/normalize
 *
 * メーカー / 車種 / 住所 / 郵便番号 / 顧客名 の表記揺れをまとめて正規化する。
 * すべて deterministic な辞書照合 (AI 不要) なので軽量・低レイテンシ。
 *
 * CSV インポート / 外部システム連携時のクレンジング用。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import {
  normalizeMaker,
  normalizeModel,
  normalizeAddress,
  normalizePostalCode,
  normalizeCustomerName,
} from "@/lib/ai/textNormalize";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  maker: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  address: z.string().max(400).optional(),
  postal_code: z.string().max(20).optional(),
  customer_name: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) return apiOk({ ai_disabled: true, normalized: parsed.data });

    const makerPolicy = resolveFieldPolicy(settings, "master_data.maker_model");
    const addressPolicy = resolveFieldPolicy(settings, "master_data.address");

    return apiOk({
      ai_disabled: false,
      normalized: {
        maker: makerPolicy === "manual" ? parsed.data.maker ?? null : normalizeMaker(parsed.data.maker ?? null),
        model: makerPolicy === "manual" ? parsed.data.model ?? null : normalizeModel(parsed.data.model ?? null),
        address: addressPolicy === "manual" ? parsed.data.address ?? null : normalizeAddress(parsed.data.address ?? null).full,
        prefecture: addressPolicy === "manual" ? null : normalizeAddress(parsed.data.address ?? null).prefecture,
        postal_code: addressPolicy === "manual" ? parsed.data.postal_code ?? null : normalizePostalCode(parsed.data.postal_code ?? null),
        customer_name: normalizeCustomerName(parsed.data.customer_name ?? null),
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "master-data normalize");
  }
}
