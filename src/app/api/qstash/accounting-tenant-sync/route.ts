import { withQstashSignature } from "@/lib/qstash/verifySignature";
import { z } from "zod";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { apiInternalError, apiValidationError } from "@/lib/api/response";
import { syncTenantToProvider } from "@/lib/accounting/sync";
import type { AccountingProvider } from "@/lib/accounting/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  tenant_id: z.string().uuid(),
  provider: z.enum(["freee", "moneyforward"]),
});

async function handler(req: Request) {
  const parsed = schema.safeParse(await parseJsonSafe(req));
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  try {
    const result = await syncTenantToProvider({
      tenantId: parsed.data.tenant_id,
      provider: parsed.data.provider as AccountingProvider,
      triggerType: "scheduled",
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return apiInternalError(error, "qstash/accounting-tenant-sync");
  }
}

export const POST = withQstashSignature(handler);
