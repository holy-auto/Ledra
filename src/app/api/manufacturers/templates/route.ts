
import { listCertifiedManufacturerTemplates } from "@/lib/manufacturers/certifiedTemplates";
import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/manufacturers/templates
 *
 * Tenant-side endpoint returning the manufacturer-fixed designs
 * the current tenant is certified to issue under. Empty array
 * means "this tenant is not a 認定施工店 of any manufacturer" —
 * the caller should fall back to the existing tenant template
 * picker.
 */
export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const entries = await listCertifiedManufacturerTemplates(caller.tenantId);
      return apiJson({ entries });
    } catch (e) {
      return apiInternalError(e, "GET /api/manufacturers/templates");
    }
  },
  { routeName: "GET /api/manufacturers/templates" },
);
