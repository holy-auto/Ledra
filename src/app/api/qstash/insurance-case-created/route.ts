import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const body = await request.json().catch(() => null);

  if (!body) {
    return Response.json({ ok: false, error: "no payload" }, { status: 400 });
  }

  console.info("[QSTASH][insurance-case-created] processing:", JSON.stringify(body));

  const {
    certificate_id,
    public_id,
    tenant_id,
    customer_name,
    vehicle_model,
    vehicle_plate,
    service_type,
    created_by,
  } = body as Record<string, string | undefined>;

  if (!certificate_id || !tenant_id) {
    return Response.json({ ok: false, error: "missing certificate_id or tenant_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // 1. Get tenant info for context
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, contact_email")
      .eq("id", tenant_id)
      .single();

    const shopName = tenant?.name ?? "施工店";

    // 2. Log notification event
    await admin.from("notification_logs").insert({
      tenant_id,
      type: "certificate_created",
      target_type: "certificate",
      target_id: certificate_id,
      recipient_email: tenant?.contact_email ?? null,
      status: "sent",
    }).then(({ error }) => {
      if (error) console.warn("[QSTASH] notification_logs insert failed:", error.message);
    });

    // 3. Check if any insurers exist and should be notified
    //    (Future: insurer notification preferences, API subscriptions)
    const { data: insurers } = await admin
      .from("insurers")
      .select("id, name, contact_email, plan_tier")
      .eq("is_active", true);

    const notifiedInsurers: string[] = [];

    if (insurers && insurers.length > 0) {
      // For each active insurer, log the new certificate availability
      for (const insurer of insurers) {
        // Enterprise insurers could get real-time email notifications
        if (insurer.plan_tier === "enterprise" && insurer.contact_email) {
          // Future: Send email notification about new certificate
          // For now, just record that the insurer was notified
          notifiedInsurers.push(insurer.name);
        }
      }
    }

    console.info("[QSTASH][insurance-case-created] done", {
      certificate_id,
      public_id,
      shopName,
      insurersNotified: notifiedInsurers.length,
    });

    return Response.json({
      ok: true,
      certificate_id,
      public_id,
      insurers_notified: notifiedInsurers.length,
    });
  } catch (e) {
    console.error("[QSTASH][insurance-case-created] error:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
