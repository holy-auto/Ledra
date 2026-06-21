/**
 * POST /api/admin/body-repair-jobs/[id]/consent-request
 *
 * 車体整備の「作業前 (見積) 同意」/「作業中の変更同意」依頼を作成する
 * (ガイドライン4.2(5))。店舗管理画面から呼び出し、顧客への同意サイン URL を発行。
 *
 * 受領サイン (delivery-receipt-request) と同じ signature_sessions 基盤を流用し、
 * purpose='estimate_consent' / 'change_consent'、本人確認は顧客電話番号下4桁。
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { computeDocumentHash } from "@/lib/signature/hash";
import { phoneLast4Hash } from "@/lib/customerPortalServer";
import {
  BODY_REPAIR_CONSENT_VERSION,
  CONSENT_KIND_PURPOSE,
  CONSENT_KIND_LABEL,
  computeConsentTextHash,
  getConsentText,
  canonicalizeExplanation,
  type BodyRepairConsentKind,
  type ConsentExplanationSnapshot,
} from "@/lib/signature/bodyRepairConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? "/sign";
const CONSENT_SIGN_PATH = `${SIGN_BASE_URL}/consent`;
const EXPIRES_HOURS = Number(process.env.SIGNATURE_SESSION_EXPIRES_HOURS ?? 72);

const requestSchema = z.object({
  kind: z.enum(["pre_work", "change"]),
  signer_email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/** 平文電話番号から下4桁を取り出す (数字以外を除去)。取り出せなければ null。 */
function extractLast4(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id: jobId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return apiValidationError("job_id が不正です");

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { kind, signer_email } = parsed.data as { kind: BodyRepairConsentKind; signer_email?: string };

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 案件 + 顧客 + 車両を取得 (テナント境界チェック込み)
    const { data: job, error: jobErr } = await admin
      .from("body_repair_jobs")
      .select(
        `
        id, tenant_id, planned_work_json, actual_work_json, deviation_reason,
        estimate_amount, actual_amount,
        customer:customers ( id, name, phone ),
        vehicle:vehicles ( maker, model, plate_display )
      `,
      )
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (jobErr) return apiInternalError(jobErr, "consent-request job fetch");
    if (!job) return apiError({ code: "not_found", message: "案件が見つかりません", status: 404 });

    const customer = (Array.isArray(job.customer) ? job.customer[0] : job.customer) as {
      id: string;
      name: string | null;
      phone: string | null;
    } | null;
    const vehicle = (Array.isArray(job.vehicle) ? job.vehicle[0] : job.vehicle) as {
      maker: string | null;
      model: string | null;
      plate_display: string | null;
    } | null;

    const last4 = extractLast4(customer?.phone);
    if (!last4) {
      return apiValidationError(
        "同意サインには本人確認用の電話番号下4桁が必要です。案件の顧客に電話番号を登録してから再度お試しください。",
      );
    }
    const last4Hash = phoneLast4Hash(caller.tenantId, last4);

    // 同一 kind の有効な pending 依頼があれば再利用 (idempotent)
    const purpose = CONSENT_KIND_PURPOSE[kind];
    const { data: existing } = await admin
      .from("body_repair_consents")
      .select("id, status, signature_sessions:signature_sessions(token, expires_at, status)")
      .eq("tenant_id", caller.tenantId)
      .eq("body_repair_job_id", jobId)
      .eq("kind", kind)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingSessRaw = existing?.signature_sessions as unknown as
      | { token: string; expires_at: string; status: string }
      | Array<{ token: string; expires_at: string; status: string }>
      | null;
    const existingSess = Array.isArray(existingSessRaw) ? (existingSessRaw[0] ?? null) : existingSessRaw;
    if (existing && existingSess?.status === "pending" && new Date(existingSess.expires_at) > new Date()) {
      return apiOk({
        consent_id: existing.id,
        sign_url: `${CONSENT_SIGN_PATH}/${existingSess.token}`,
        expires_at: existingSess.expires_at,
        is_existing: true,
        message: "有効な同意依頼がすでに存在します",
      });
    }

    // 説明内容スナップショット + document_hash
    const consentTextHash = computeConsentTextHash(kind);
    const baseSnapshot: Omit<ConsentExplanationSnapshot, "consent"> = {
      kind,
      shop: { name: null },
      vehicle: vehicle ? { maker: vehicle.maker, model: vehicle.model, plate: vehicle.plate_display } : null,
      work: {
        planned: (job.planned_work_json as Record<string, unknown>) ?? null,
        actual: (job.actual_work_json as Record<string, unknown>) ?? null,
        deviation_reason: job.deviation_reason ?? null,
      },
      fees: { estimate_amount: job.estimate_amount ?? null, actual_amount: job.actual_amount ?? null },
    };
    const { data: tenant } = await admin.from("tenants").select("name").eq("id", caller.tenantId).maybeSingle();
    baseSnapshot.shop.name = tenant?.name ?? null;

    const documentHash = computeDocumentHash(Buffer.from(canonicalizeExplanation(baseSnapshot)));
    const snapshot: ConsentExplanationSnapshot = {
      ...baseSnapshot,
      consent: { version: BODY_REPAIR_CONSENT_VERSION, text: getConsentText(kind), text_hash: consentTextHash },
    };

    // signature_sessions を作成
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

    const { data: session, error: sessErr } = await admin
      .from("signature_sessions")
      .insert({
        tenant_id: caller.tenantId,
        created_by: caller.userId,
        token,
        expires_at: expiresAt,
        status: "pending",
        document_hash: documentHash,
        document_hash_alg: "SHA-256",
        signer_name: customer?.name ?? null,
        signer_email: signer_email ?? null,
        notification_method: signer_email ? "email" : "line",
        purpose,
        secondary_factor_required: true,
        secondary_factor_verified: false,
        secondary_factor_attempts: 0,
        phone_last4_hash: last4Hash,
        consent_version: BODY_REPAIR_CONSENT_VERSION,
        consent_text_hash: consentTextHash,
      })
      .select("id")
      .single();

    if (sessErr || !session)
      return apiError({ code: "db_error", message: "同意依頼の作成に失敗しました", status: 500 });

    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "session_created",
      metadata: { purpose, body_repair_job_id: jobId, kind, consent_version: BODY_REPAIR_CONSENT_VERSION },
    });

    const { data: consent, error: consentErr } = await admin
      .from("body_repair_consents")
      .insert({
        tenant_id: caller.tenantId,
        body_repair_job_id: jobId,
        kind,
        signature_session_id: session.id,
        status: "pending",
        explanation_json: snapshot,
        created_by: caller.userId,
      })
      .select("id")
      .single();

    if (consentErr || !consent) {
      return apiError({ code: "db_error", message: "同意レコードの作成に失敗しました", status: 500 });
    }

    return apiOk({
      consent_id: consent.id,
      kind,
      kind_label: CONSENT_KIND_LABEL[kind],
      sign_url: `${CONSENT_SIGN_PATH}/${token}`,
      expires_at: expiresAt,
    });
  } catch (e) {
    return apiInternalError(e, "admin/body-repair-jobs/[id]/consent-request");
  }
}
