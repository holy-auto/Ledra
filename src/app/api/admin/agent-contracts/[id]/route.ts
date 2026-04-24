import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiUnauthorized, apiForbidden, apiInternalError, apiNotFound, apiValidationError } from "@/lib/api/response";
import { notifyAgentSignRequest } from "@/lib/agent/email";

type RouteContext = { params: Promise<{ id: string }> };

const TOKEN_TTL_DAYS = 7;

function generateSignToken(): string {
  return randomBytes(32).toString("hex");
}

function tokenExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_TTL_DAYS);
  return d.toISOString();
}

/**
 * GET /api/admin/agent-contracts/[id]
 * 署名依頼の詳細を返す。
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_signing_requests")
      .select(
        "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
      )
      .eq("id", id)
      .single();

    if (error || !data) return apiNotFound("contract not found");

    return NextResponse.json({ contract: data });
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts [id] GET");
  }
}

/**
 * PUT /api/admin/agent-contracts/[id]
 * 署名依頼の再送またはキャンセル。
 * Body: { action: "resend" | "cancel" }
 */
export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = await request.json();
    const { action } = body;
    const admin = getAdminClient();

    const { data: record, error: fetchErr } = await admin
      .from("agent_signing_requests")
      .select(
        "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
      )
      .eq("id", id)
      .single();

    if (fetchErr || !record) return apiNotFound("contract not found");

    if (action === "resend") {
      if (!["sent", "viewed"].includes(record.status)) {
        return apiValidationError("再送は送信済み/閲覧済みのリクエストのみ可能です");
      }

      // 新しいトークンを発行して有効期限を延長
      const newToken = generateSignToken();
      const newExpiresAt = tokenExpiresAt();
      const now = new Date().toISOString();

      const { data: updated } = await admin
        .from("agent_signing_requests")
        .update({
          sign_token: newToken,
          sign_expires_at: newExpiresAt,
          sent_at: now,
          status: "sent",
          updated_at: now,
        })
        .eq("id", id)
        .select(
          "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
        )
        .single();

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const signUrl = `${baseUrl}/agent-sign/${newToken}`;

      if (updated) {
        await notifyAgentSignRequest(updated.signer_email, {
          signerName: updated.signer_name,
          title: updated.title,
          signUrl,
          expiresAt: newExpiresAt,
          // 新しい token を使うので idempotency key も token に紐付けて常に再送される
          idempotencyKey: `agent-contract-resend:${updated.id}:${newToken}`,
        });
      }

      return NextResponse.json({ contract: updated, sign_url: signUrl });
    }

    if (action === "cancel") {
      if (["signed", "expired"].includes(record.status)) {
        return apiValidationError("署名完了・期限切れのリクエストはキャンセルできません");
      }

      const { data: updated } = await admin
        .from("agent_signing_requests")
        .update({
          status: "expired",
          sign_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          "id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, signed_pdf_path, requested_by, created_at, updated_at",
        )
        .single();

      return NextResponse.json({ contract: updated });
    }

    return apiValidationError("invalid action. Must be: resend, cancel");
  } catch (e) {
    return apiInternalError(e, "admin/agent-contracts [id] PUT");
  }
}
