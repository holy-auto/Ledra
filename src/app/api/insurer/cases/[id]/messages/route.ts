import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import {
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCaseMessageNotification } from "@/lib/insurer/notifications";

export const runtime = "nodejs";

/**
 * Verify the case exists and belongs to the caller's insurer.
 * Returns the case data or a Response (error).
 */
async function verifyCase(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  insurerId: string,
) {
  const { data, error } = await admin
    .from("insurer_cases")
    .select("id, insurer_id")
    .eq("id", caseId)
    .maybeSingle();

  if (error) return apiValidationError(error.message);
  if (!data) return apiNotFound("ケースが見つかりません。");
  if (data.insurer_id !== insurerId) return apiForbidden();
  return data;
}

/**
 * GET /api/insurer/cases/[id]/messages
 * List messages for a case with sender display info.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;
  const admin = createAdminClient();

  try {
    const caseOrErr = await verifyCase(admin, id, caller.insurerId);
    if (caseOrErr instanceof Response) return caseOrErr;

    // Fetch messages
    const { data: messages, error } = await admin
      .from("insurer_case_messages")
      .select("*")
      .eq("case_id", id)
      .order("created_at", { ascending: true });

    if (error) return apiValidationError(error.message);

    // Collect unique sender_ids to look up display names from insurer_users
    const senderIds = [
      ...new Set((messages ?? []).map((m) => m.sender_id).filter(Boolean)),
    ];

    let senderMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: users } = await admin
        .from("insurer_users")
        .select("user_id, display_name")
        .in("user_id", senderIds);

      if (users) {
        senderMap = Object.fromEntries(
          users.map((u) => [u.user_id, u.display_name]),
        );
      }
    }

    // Attach display_name to each message
    const enriched = (messages ?? []).map((m) => ({
      ...m,
      sender_display_name: senderMap[m.sender_id] ?? null,
    }));

    return NextResponse.json({ messages: enriched });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/cases/[id]/messages");
  }
}

/**
 * POST /api/insurer/cases/[id]/messages
 * Send a message to a case.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON body.");
  }

  const { content } = body as { content?: string };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return apiValidationError("content is required.");
  }

  const admin = createAdminClient();

  try {
    const caseOrErr = await verifyCase(admin, id, caller.insurerId);
    if (caseOrErr instanceof Response) return caseOrErr;

    const { data: message, error } = await admin
      .from("insurer_case_messages")
      .insert({
        case_id: id,
        sender_id: caller.userId,
        sender_type: "insurer",
        content: content.trim(),
      })
      .select("*")
      .single();

    if (error) return apiValidationError(error.message);

    // Log to insurer_access_logs
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_message",
      meta: {
        case_id: id,
        message_id: message.id,
        route: "POST /api/insurer/cases/[id]/messages",
      },
      ip,
      user_agent: ua,
    });

    // Send message notification (fire-and-forget)
    (async () => {
      try {
        // Get case details for notification
        const { data: caseData } = await admin
          .from("insurer_cases")
          .select("case_number, title, tenant_id, insurer_id")
          .eq("id", id)
          .single();

        if (!caseData) return;

        // Get sender display name
        const { data: senderUser } = await admin
          .from("insurer_users")
          .select("display_name")
          .eq("user_id", caller.userId)
          .eq("insurer_id", caller.insurerId)
          .maybeSingle();

        const senderName = senderUser?.display_name ?? "保険会社ユーザー";

        // Notify tenant if case has tenant_id
        if (caseData.tenant_id) {
          const { data: tenant } = await admin
            .from("tenants")
            .select("name, contact_email")
            .eq("id", caseData.tenant_id)
            .single();

          if (tenant?.contact_email) {
            await sendCaseMessageNotification({
              recipientEmail: tenant.contact_email,
              recipientName: tenant.name ?? "施工店",
              caseNumber: caseData.case_number ?? id,
              caseTitle: caseData.title ?? "",
              senderName,
              messagePreview: content.trim(),
            });
          }
        }

        // @mention notifications — parse content for @display_name patterns
        const mentionPattern = /@([^\s@]+(?:\s[^\s@]+)?)/g;
        const mentions: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = mentionPattern.exec(content.trim())) !== null) {
          mentions.push(match[1]);
        }

        if (mentions.length > 0) {
          // Look up mentioned users by display_name within the same insurer
          const { data: mentionedUsers } = await admin
            .from("insurer_users")
            .select("user_id, display_name")
            .eq("insurer_id", caller.insurerId)
            .eq("is_active", true)
            .in("display_name", mentions);

          if (mentionedUsers && mentionedUsers.length > 0) {
            const caseNumber = caseData.case_number ?? id;
            const notifications = mentionedUsers
              .filter((u) => u.user_id !== caller.userId) // Don't notify self
              .map((u) => ({
                insurer_id: caller.insurerId,
                user_id: u.user_id,
                type: "new_message",
                title: `${senderName}さんからメンションされました`,
                body: `案件 ${caseNumber}: ${content.trim().slice(0, 100)}`,
                link: `/insurer/cases/${id}`,
              }));

            if (notifications.length > 0) {
              try {
                await admin
                  .from("insurer_notifications")
                  .insert(notifications);
              } catch {
                // insurer_notifications table may not exist yet — silently skip
                console.warn("[mention-notification] insurer_notifications table may not exist yet, skipping.");
              }
            }
          }
        }
      } catch (e) {
        console.error("[case-notification] message notification failed:", e);
      }
    })();

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/cases/[id]/messages");
  }
}
