import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin, createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getClientIp } from "@/lib/rateLimit";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { escapeHtml } from "@/lib/sanitize";

export const runtime = "nodejs";

const VALID_STATUSES = ["active_pending_review", "active", "suspended"] as const;
const VALID_PLAN_TIERS = ["basic", "pro", "enterprise"] as const;

const insurerPatchSchema = z.object({
  insurer_id: z.string().uuid("insurer_id is required"),
  status: z.enum(VALID_STATUSES).optional(),
  plan_tier: z
    .union([z.enum(VALID_PLAN_TIERS), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? undefined : v)),
  rejection_reason: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
});

async function requirePlatformAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const caller = await resolveCallerWithRole(supabase);
  if (!caller || !isPlatformAdmin(caller)) {
    return null;
  }
  return caller;
}

/**
 * Log admin action to admin_audit_logs
 */
async function logAdminAction(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  const admin = createServiceRoleAdmin("admin audit log — writes platform-wide admin_audit_logs (no tenant scope)");
  await admin
    .from("admin_audit_logs")
    .insert({
      actor_id: params.actorId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      before_data: params.beforeData ?? null,
      after_data: params.afterData ?? null,
      ip: params.ip ?? null,
      user_agent: params.userAgent ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[admin-audit] insert failed:", error.message);
    });
}

/**
 * Send notification email to insurer on status change
 */
async function sendInsurerNotification(params: {
  email: string;
  companyName: string;
  action: "approved" | "rejected" | "suspended";
  reason?: string;
}) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!apiKey || !from) {
    console.warn("[admin/insurers] notification skipped — missing RESEND_API_KEY or RESEND_FROM");
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  // companyName / reason は審査側の自由入力であり、HTML 文脈に直接埋め込むと
  // 受信者のメールクライアントで XSS / フィッシング誘導の温床になる。
  const safeCompany = escapeHtml(params.companyName ?? "");
  const safeReason = escapeHtml(params.reason ?? "");

  let subject: string;
  let body: string;

  switch (params.action) {
    case "approved":
      subject = "【Ledra】加盟店登録が承認されました";
      body = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <div style="border-bottom: 2px solid #34c759; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">加盟店登録が承認されました</h2>
          </div>
          <p style="color: #1d1d1f; line-height: 1.6;">
            ${safeCompany} 様<br><br>
            Ledraへの加盟店登録が承認されました。<br>
            以下のリンクからログインし、ご利用を開始いただけます。
          </p>
          <p style="margin: 24px 0;">
            <a href="${baseUrl}/insurer/login" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              ログインする
            </a>
          </p>
          <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
            Ledra — 株式会社HOLY AUTO
          </div>
        </div>`;
      break;
    case "rejected":
      subject = "【Ledra】加盟店登録について";
      body = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <div style="border-bottom: 2px solid #ff9500; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">加盟店登録について</h2>
          </div>
          <p style="color: #1d1d1f; line-height: 1.6;">
            ${safeCompany} 様<br><br>
            Ledraへの加盟店登録を審査いたしましたが、今回は承認に至りませんでした。
          </p>
          ${params.reason ? `<p style="color: #1d1d1f; line-height: 1.6; background: #f5f5f7; border-radius: 8px; padding: 12px;"><strong>理由:</strong> ${safeReason}</p>` : ""}
          <p style="color: #86868b; font-size: 13px;">
            ご不明な点がございましたら、サポートまでお問い合わせください。
          </p>
          <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
            Ledra — 株式会社HOLY AUTO
          </div>
        </div>`;
      break;
    case "suspended":
      subject = "【Ledra】アカウント停止のご連絡";
      body = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <div style="border-bottom: 2px solid #ff3b30; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">アカウント停止のご連絡</h2>
          </div>
          <p style="color: #1d1d1f; line-height: 1.6;">
            ${safeCompany} 様<br><br>
            Ledraのアカウントが停止されました。
          </p>
          ${params.reason ? `<p style="color: #1d1d1f; line-height: 1.6; background: #f5f5f7; border-radius: 8px; padding: 12px;"><strong>理由:</strong> ${safeReason}</p>` : ""}
          <p style="color: #86868b; font-size: 13px;">
            ご不明な点がございましたら、サポートまでお問い合わせください。
          </p>
          <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
            Ledra — 株式会社HOLY AUTO
          </div>
        </div>`;
      break;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.email,
        reply_to: "support@ledra.co.jp",
        subject,
        html: body,
      }),
    });

    if (!res.ok) {
      // resBody は Resend のエラーレスポンスで、稀に request の email 等を
      // 含み得るため status のみログ。
      console.error("[admin/insurers] notification email error", { status: res.status });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/insurers] notification email failed", { error: msg });
  }
}

/**
 * GET /api/admin/insurers?status=active_pending_review
 * 全保険会社一覧（プラットフォーム管理者専用）
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const caller = await requirePlatformAdmin(supabase);
  if (!caller) {
    return apiForbidden();
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "";

  const { admin } = createTenantScopedAdmin(caller.tenantId);
  let query = admin
    .from("insurers")
    .select(
      "id, name, slug, is_active, status, plan_tier, requested_plan, contact_person, contact_email, contact_phone, signup_source, business_type, corporate_number, address, representative_name, terms_accepted_at, rejection_reason, created_at, updated_at, reviewed_at, activated_at",
    )
    .order("created_at", { ascending: false });

  if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return apiInternalError(error, "insurers GET");
  }

  return apiJson({ insurers: data ?? [] });
}

/**
 * PATCH /api/admin/insurers
 * 保険会社のステータス・プラン更新（プラットフォーム管理者専用）
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const caller = await requirePlatformAdmin(supabase);
  if (!caller) {
    return apiForbidden();
  }

  const parsed = insurerPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { insurer_id, status, plan_tier, rejection_reason } = parsed.data;

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  // Fetch current state for audit log
  const { data: beforeInsurer } = await admin
    .from("insurers")
    .select("id, name, status, plan_tier, contact_email, rejection_reason")
    .eq("id", insurer_id)
    .single();

  if (!beforeInsurer) {
    return apiNotFound("保険会社が見つかりません。");
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (status) {
    updates.status = status;
    updates.reviewed_at = new Date().toISOString();
    updates.reviewed_by = caller.userId;

    if (status === "active") {
      updates.activated_at = new Date().toISOString();
    }
  }

  if (plan_tier !== undefined) {
    updates.plan_tier = plan_tier;
  }

  if (rejection_reason !== undefined) {
    updates.rejection_reason = rejection_reason;
  }

  const { data, error } = await admin
    .from("insurers")
    .update(updates)
    .eq("id", insurer_id)
    .select("id, name, status, plan_tier, activated_at, reviewed_at, rejection_reason")
    .single();

  if (error) {
    return apiInternalError(error, "insurers PATCH");
  }

  // Audit log
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "";
  logAdminAction({
    actorId: caller.userId,
    action: status ? `insurer_status_${status}` : "insurer_update",
    targetType: "insurer",
    targetId: insurer_id,
    beforeData: { status: beforeInsurer.status, plan_tier: beforeInsurer.plan_tier },
    afterData: { status: data.status, plan_tier: data.plan_tier, rejection_reason: data.rejection_reason },
    ip,
    userAgent,
  });

  // Send notification email
  if (status && beforeInsurer.contact_email) {
    const emailAction =
      status === "active"
        ? ("approved" as const)
        : status === "suspended"
          ? beforeInsurer.status === "active_pending_review"
            ? ("rejected" as const)
            : ("suspended" as const)
          : null;

    if (emailAction) {
      sendInsurerNotification({
        email: beforeInsurer.contact_email,
        companyName: beforeInsurer.name,
        action: emailAction,
        reason: rejection_reason ?? undefined,
      });
    }
  }

  return apiJson({ ok: true, insurer: data });
}
