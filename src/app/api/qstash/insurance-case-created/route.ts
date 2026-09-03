import { parseJsonSafe } from "@/lib/api/safeJson";
import { withQstashSignature } from "@/lib/qstash/verifySignature";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiValidationError, apiInternalError } from "@/lib/api/response";
import { notifyPartnersOnIssue } from "@/lib/certificates/issueNotifications";

/**
 * QStash handler: insurance-case-created
 *
 * Triggered asynchronously when a new certificate is created.
 * Performs non-blocking tasks:
 * 1. Log the event to insurer_access_logs (if applicable insurers exist)
 * 2. Record notification_logs entry
 * 3. Future: notify relevant insurers via email
 */
async function handler(request: Request) {
  const body = await parseJsonSafe(request);

  if (!body) {
    return apiValidationError("no payload");
  }

  console.info("[QSTASH][insurance-case-created] processing:", JSON.stringify(body));

  const { certificate_id, public_id, tenant_id, service_type } = body as Record<string, string | undefined>;

  if (!certificate_id || !tenant_id) {
    return apiValidationError("missing certificate_id or tenant_id");
  }

  const { admin } = createTenantScopedAdmin(tenant_id);

  try {
    // 1. Get tenant info for context
    const { data: tenant } = await admin.from("tenants").select("name, contact_email").eq("id", tenant_id).single();

    const shopName = tenant?.name ?? "施工店";

    // 2. Log notification event
    await admin
      .from("notification_logs")
      .insert({
        tenant_id,
        type: "certificate_created",
        target_type: "certificate",
        target_id: certificate_id,
        recipient_email: tenant?.contact_email ?? null,
        status: "sent",
      })
      .then(({ error }) => {
        if (error) console.warn("[QSTASH] notification_logs insert failed:", error.message);
      });

    // 3. 連携先（enterprise 保険会社 / 当証明書のメーカー）へリアルタイム通知。
    //    PII は載せない（連携先はポータルでマスキング済みデータを参照する）。
    //    通知失敗で発行フロー本体は止めない。
    const notified = await notifyPartnersOnIssue(admin, {
      publicId: public_id ?? certificate_id,
      tenantId: tenant_id,
      shopName,
      serviceType: service_type ?? null,
    }).catch((e) => {
      console.warn("[QSTASH] partner issue notify failed:", e instanceof Error ? e.message : String(e));
      return { insurers: 0, manufacturers: 0 };
    });

    console.info("[QSTASH][insurance-case-created] done", {
      certificate_id,
      public_id,
      shopName,
      insurersNotified: notified.insurers,
      manufacturersNotified: notified.manufacturers,
    });

    return Response.json({
      ok: true,
      certificate_id,
      public_id,
      insurers_notified: notified.insurers,
      manufacturers_notified: notified.manufacturers,
    });
  } catch (e) {
    console.error("[QSTASH][insurance-case-created] error:", e);
    return apiInternalError(e, "qstash/insurance-case-created");
  }
}

export const POST = withQstashSignature(handler);
