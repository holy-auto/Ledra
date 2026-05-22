import { getPassportData } from "@/lib/passport/getPassportData";

/**
 * Public API response shape for `GET /api/v1/passport/verify`.
 *
 * Contains the same information shown on the free portion of the
 * `/v/[vin]` page. **No PII** — no owner names, no exact service
 * dates beyond the day, no shop addresses. Shop names are
 * included because they're already public branding.
 */
export type PassportVerifyResponse = {
  vin_normalized: string;
  passport_id: string; // last 6 chars of normalized VIN — Ledra display id
  vehicle: {
    maker: string | null;
    model: string | null;
    year: number | null;
  };
  summary: {
    anchored_certificate_count: number;
    tenant_count: number;
    first_seen_at: string;
    last_activity_at: string;
  };
  certificates: {
    service_type: string | null;
    performed_at: string | null;
    shop_name: string | null;
    anchored: true; // all returned certs are anchored
    polygon_tx_hash: string | null;
    polygon_network: "polygon" | "amoy" | null;
    explorer_url: string | null;
  }[];
};

/** Build the sanitized API response from a normalized VIN. */
export async function buildPassportVerifyResponse(vin: string): Promise<PassportVerifyResponse | null> {
  const data = await getPassportData(vin);
  if (!data) return null;

  return {
    vin_normalized: data.vin_code_normalized,
    passport_id: data.vin_code_normalized.slice(-6),
    vehicle: {
      maker: data.display_maker,
      model: data.display_model,
      year: data.display_year,
    },
    summary: {
      anchored_certificate_count: data.anchored_cert_count,
      tenant_count: data.tenant_count,
      first_seen_at: data.first_seen_at,
      last_activity_at: data.last_activity_at,
    },
    certificates: data.certificates.map((c) => ({
      service_type: c.service_type,
      performed_at: c.created_at,
      shop_name: c.shop_name,
      anchored: true as const,
      polygon_tx_hash: c.primary_tx_hash,
      polygon_network: c.primary_tx_network,
      explorer_url: c.primary_explorer_url,
    })),
  };
}
