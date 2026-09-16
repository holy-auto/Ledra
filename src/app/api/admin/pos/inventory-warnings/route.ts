/**
 * POST /api/admin/pos/inventory-warnings
 *
 * Pre-checkout soft-block: given a draft POS cart (same `items_json` shape
 * the checkout route accepts), return per-item inventory warnings without
 * mutating anything.
 *
 * The cashier UI calls this when the cart changes (debounced) and surfaces
 * a yellow / red banner above the "確定" button. Final write-side
 * enforcement is still in `pos_checkout` (and the existing
 * `deductInventoryForPosItems` post-checkout deduction).
 *
 * Auth: staff or above. The route uses the user-scoped client so RLS keeps
 * cross-tenant access closed without us having to scope manually.
 */

import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkInventoryForPosItems } from "@/lib/pos/inventoryWarnings";
import { z } from "zod";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  items_json: z.array(z.unknown()).max(200),
});

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // Mild rate limit — this fires on every cart edit so it's hot, but not
      // hot enough to need its own bucket. 60/min/user is well above realistic
      // POS throughput.
      const rlKey = `pos-inv-warn:${caller.userId || getClientIp(req)}`;
      const rl = await checkRateLimit(rlKey, { limit: 60, windowSec: 60 });
      if (!rl.allowed) {
        return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
      }

      const parsed = inputSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const warnings = await checkInventoryForPosItems(supabase, parsed.data.items_json, caller.tenantId);
      return apiJson({ warnings });
    } catch (e: unknown) {
      return apiInternalError(e, "pos/inventory-warnings");
    }
  },
  { minRole: "staff", routeName: "admin/pos/inventory-warnings POST" },
);
