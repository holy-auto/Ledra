import { NextRequest, after } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { sendCaseStatusNotification } from "@/lib/insurer/notifications";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";
import { insurerCaseUpdateSchema } from "@/lib/validations/insurer-case";

export const runtime = "nodejs";

const CASE_COLUMNS =
  "id, insurer_id, title, description, status, priority, category, case_number, certificate_id, vehicle_id, tenant_id, assigned_to, created_by, resolved_at, closed_at, created_at, updated_at, meta";

/**
 * GET /api/insurer/cases/[id]
 * Get case detail with messages and attachments.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;
  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Fetch case with insurer scope filter so that we never accidentally
    // read another insurer's case via IDOR (defense in depth over the
    // manual insurer_id check below).
    const { data: caseData, error: caseErr } = await admin
      .from("insurer_cases")
      .select(CASE_COLUMNS)
      .eq("id", id)
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (caseErr) return apiValidationError(caseErr.message);
    if (!caseData) return apiNotFound("ケースが見つかりません。");

    // Fetch messages
    const { data: messages } = await admin
      .from("insurer_case_messages")
      .select("id, case_id, sender_id, sender_type, content, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: true });

    // Fetch attachments
    const { data: attachments } = await admin
      .from("insurer_case_attachments")
      .select("id, case_id, file_name, file_size, file_type, storage_path, uploaded_by, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: true });

    return apiJson({
      case: caseData,
      messages: messages ?? [],
      attachments: attachments ?? [],
    });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/cases/[id]");
  }
}

/**
 * PATCH /api/insurer/cases/[id]
 * Update case fields.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;

  const parsed = insurerCaseUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Verify case exists AND belongs to caller's insurer in one query
    // (avoids TOCTOU between check and update).
    const { data: existing, error: fetchErr } = await admin
      .from("insurer_cases")
      .select("id, insurer_id, status")
      .eq("id", id)
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (fetchErr) return apiValidationError(fetchErr.message);
    if (!existing) return apiNotFound("ケースが見つかりません。");

    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updateData[k] = v;
    }

    if (Object.keys(updateData).length === 0) {
      return apiValidationError("No valid fields to update.");
    }

    // Handle status transition timestamps
    if (updateData.status === "resolved" && existing.status !== "resolved") {
      updateData.resolved_at = new Date().toISOString();
    }
    if (updateData.status === "closed" && existing.status !== "closed") {
      updateData.closed_at = new Date().toISOString();
    }

    updateData.updated_at = new Date().toISOString();

    const isStatusChange = updateData.status !== undefined && updateData.status !== existing.status;

    // Scope the UPDATE by insurer_id (no cross-insurer write) and, on a status
    // transition, also by the status we read above (compare-and-swap). The
    // status CAS makes "did THIS request flip the case?" race-free, matching
    // the bulk route: two concurrent PATCHes flipping the same case no longer
    // both pass the gate below and double-emit the status_changed webhook. A
    // non-status update keeps matching on id+insurer only, so a concurrent
    // status change elsewhere doesn't spuriously fail an unrelated field edit.
    let updateQuery = admin.from("insurer_cases").update(updateData).eq("id", id).eq("insurer_id", caller.insurerId);
    if (isStatusChange) updateQuery = updateQuery.eq("status", existing.status);

    const { data: updated, error: updateErr } = await updateQuery.select(CASE_COLUMNS).maybeSingle();

    if (updateErr) return apiValidationError(updateErr.message);

    if (!updated) {
      // Either the row vanished between read and write, or (on a status change)
      // another request won the compare-and-swap and already transitioned it.
      // Re-read and return the current row without re-emitting the webhook —
      // this request did not perform the transition.
      const { data: current } = await admin
        .from("insurer_cases")
        .select(CASE_COLUMNS)
        .eq("id", id)
        .eq("insurer_id", caller.insurerId)
        .maybeSingle();
      if (!current) return apiNotFound("ケースが見つかりません。");
      return apiJson({ case: current });
    }

    // Log to insurer_access_logs
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_update",
      meta: {
        case_id: id,
        updated_fields: Object.keys(updateData),
        route: "PATCH /api/insurer/cases/[id]",
      },
      ip,
      user_agent: ua,
    });

    // Send notification on status change. Registered with after() so the
    // work is guaranteed to run in serverless (an unawaited bare async IIFE
    // can be dropped once the response is sent).
    if (isStatusChange) {
      after(async () => {
        try {
          // Notify insurer admin users about the status change
          const { data: insurerUsers } = await admin
            .from("insurer_users")
            .select("user_id, display_name")
            .eq("insurer_id", caller.insurerId)
            .eq("is_active", true)
            .eq("role", "admin");

          if (insurerUsers && insurerUsers.length > 0) {
            const userIds = insurerUsers.map((u) => u.user_id).filter((uid) => uid !== caller.userId);
            if (userIds.length > 0) {
              // Notification email lives on the insurer row (shared address),
              // so no extra lookup per-user is needed.
              const { data: insurer } = await admin
                .from("insurers")
                .select("contact_email, name")
                .eq("id", caller.insurerId)
                .single();

              if (insurer?.contact_email) {
                const senderUser = insurerUsers.find((u) => u.user_id === caller.userId);
                await sendCaseStatusNotification({
                  recipientEmail: insurer.contact_email,
                  recipientName: insurer.name ?? "担当者",
                  caseNumber: updated.case_number ?? id,
                  caseTitle: updated.title ?? "",
                  oldStatus: existing.status,
                  newStatus: String(updateData.status),
                  updatedBy: senderUser?.display_name ?? "保険会社ユーザー",
                });
              }
            }
          }

          // Notify tenant if case has tenant_id
          if (updated.tenant_id) {
            // 基幹ソフト連携向け webhook (購読が無ければ no-op)。メール通知とは独立。
            await emitEntityWebhook(updated.tenant_id, "insurer_case.status_changed", id, {
              case_id: id,
              case_number: updated.case_number,
              title: updated.title,
              old_status: existing.status,
              new_status: updateData.status,
              insurer_id: caller.insurerId,
              updated_at: updated.updated_at,
            });

            const { data: tenant } = await admin
              .from("tenants")
              .select("name, contact_email")
              .eq("id", updated.tenant_id)
              .single();

            if (tenant?.contact_email) {
              const senderUser = insurerUsers?.find((u) => u.user_id === caller.userId);
              await sendCaseStatusNotification({
                recipientEmail: tenant.contact_email,
                recipientName: tenant.name ?? "施工店",
                caseNumber: updated.case_number ?? id,
                caseTitle: updated.title ?? "",
                oldStatus: existing.status,
                newStatus: String(updateData.status),
                updatedBy: senderUser?.display_name ?? "保険会社",
              });
            }
          }
        } catch (e) {
          console.error("[case-notification] status change notification failed:", e);
        }
      });
    }

    return apiJson({ case: updated });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/cases/[id]");
  }
}
