import { withQstashSignature } from "@/lib/qstash/verifySignature";
import { z } from "zod";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { apiInternalError, apiValidationError } from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { pullEventsFromCalendar, pushReservationsToCalendar } from "@/lib/gcal/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  tenant_id: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

async function handler(req: Request) {
  const parsed = schema.safeParse(await parseJsonSafe(req));
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  const { tenant_id, from, to } = parsed.data;
  try {
    const pushed = await pushReservationsToCalendar(tenant_id, from, to);
    const pulled = await pullEventsFromCalendar(tenant_id, from, to);
    const { admin } = createTenantScopedAdmin(tenant_id);
    await admin.from("tenants").update({ gcal_last_synced_at: new Date().toISOString() }).eq("id", tenant_id);
    return Response.json({ ok: true, pushed, ...pulled });
  } catch (error) {
    return apiInternalError(error, "qstash/gcal-tenant-sync");
  }
}

export const POST = withQstashSignature(handler);
