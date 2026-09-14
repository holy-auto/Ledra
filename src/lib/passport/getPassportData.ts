import { getReadReplica } from "@/lib/supabase/readReplica";
import { buildExplorerUrl } from "@/lib/anchoring/providers";
import { normalizeVin } from "@/lib/passport/normalizeVin";

// ラベルは client からも使うため独立モジュールへ移した。既存の import 経路は維持する。
export { getServiceTypeLabel } from "@/lib/certificates/serviceTypeLabel";

export type PassportCertCard = {
  public_id: string;
  service_type: string | null;
  created_at: string | null;
  shop_name: string | null;
  anchored_image_count: number;
  primary_tx_hash: string | null;
  primary_tx_network: "polygon" | "amoy" | null;
  primary_explorer_url: string | null;
};

export type PassportMetaAnchor = {
  hash: string;
  tx_hash: string;
  network: "polygon" | "amoy";
  anchored_at: string;
  image_count: number | null;
  cert_count: number | null;
  explorer_url: string | null;
};

export type PassportData = {
  vin_code_normalized: string;
  display_maker: string | null;
  display_model: string | null;
  display_year: number | null;
  anchored_cert_count: number;
  tenant_count: number;
  first_seen_at: string;
  last_activity_at: string;
  certificates: PassportCertCard[];
  meta_anchor: PassportMetaAnchor | null;
};

type PassportRow = {
  vin_code_normalized: string;
  display_maker: string | null;
  display_model: string | null;
  display_year: number | null;
  anchored_cert_count: number;
  tenant_count: number;
  first_seen_at: string;
  last_activity_at: string;
  meta_anchor_hash: string | null;
  meta_anchor_tx_hash: string | null;
  meta_anchor_network: string | null;
  meta_anchor_anchored_at: string | null;
  meta_anchor_image_count: number | null;
  meta_anchor_cert_count: number | null;
};

export async function getPassportData(vinRaw: string): Promise<PassportData | null> {
  // Stored VINs are NFKC-normalized with whitespace and hyphens stripped, so
  // the lookup has to apply the same rule. A bare trim+uppercase left
  // `/v/JH4-DC5-3001` and full-width VINs unable to find their own passport —
  // the v1 API routes and the report checkout already used normalizeVin().
  const vin = normalizeVin(vinRaw);
  // 空は照合しない。保存側は空を NULL にするので `.eq("...", "")` は何にも
  // 当たらず結果は同じだが、**偶然そうなっている**状態を残さない。
  // 公開ルートなので、不正な入力でDBを1往復させない意味もある
  if (!vin) return null;
  // Anonymous public read path → safe to route to the replica when configured.
  // Eventual consistency (<1s lag) is acceptable here because newly-issued
  // certificates take much longer to anchor on Polygon anyway, so a fresh
  // passport view never depends on sub-second write visibility.
  const admin = getReadReplica("passport public page — /v/[vin], anonymous caller");

  const { data: passportRaw } = await admin
    .from("vehicle_passports")
    .select(
      "vin_code_normalized, display_maker, display_model, display_year, " +
        "anchored_cert_count, tenant_count, first_seen_at, last_activity_at, " +
        "meta_anchor_hash, meta_anchor_tx_hash, meta_anchor_network, " +
        "meta_anchor_anchored_at, meta_anchor_image_count, meta_anchor_cert_count",
    )
    .eq("vin_code_normalized", vin)
    .maybeSingle();
  const passport = passportRaw as PassportRow | null;
  if (!passport) return null;

  // All opt-in vehicles sharing this VIN
  const { data: vinVehiclesRaw } = await admin
    .from("vehicles")
    .select("id, tenant_id")
    .eq("vin_code_normalized", vin)
    .eq("passport_opt_out", false);
  const vinVehicles = (vinVehiclesRaw ?? []) as { id: string; tenant_id: string }[];
  if (!vinVehicles.length) return null;

  const vehicleIds = vinVehicles.map((v) => v.id);
  const tenantIds = [...new Set(vinVehicles.map((v) => v.tenant_id))];

  const [tenantsRes, certsRes] = await Promise.all([
    admin.from("tenants").select("id, name, slug").in("id", tenantIds),
    admin
      .from("certificates")
      .select("id, public_id, tenant_id, service_type, created_at")
      .in("vehicle_id", vehicleIds)
      .order("created_at", { ascending: true }),
  ]);

  const tenantMap = Object.fromEntries(
    ((tenantsRes.data ?? []) as { id: string; name: string | null; slug: string | null }[]).map((t) => [t.id, t]),
  );

  const certs = (certsRes.data ?? []) as {
    id: string;
    public_id: string;
    tenant_id: string;
    service_type: string | null;
    created_at: string | null;
  }[];
  if (!certs.length) return null;

  const certIds = certs.map((c) => c.id);

  const { data: anchoredImgs } = await admin
    .from("certificate_images")
    .select("certificate_id, polygon_tx_hash, polygon_network")
    .in("certificate_id", certIds)
    .not("polygon_tx_hash", "is", null);

  type ImgRow = { certificate_id: string; polygon_tx_hash: string; polygon_network: string | null };
  const imgsByCert = new Map<string, ImgRow[]>();
  for (const img of (anchoredImgs ?? []) as ImgRow[]) {
    const arr = imgsByCert.get(img.certificate_id) ?? [];
    arr.push(img);
    imgsByCert.set(img.certificate_id, arr);
  }

  const cards: PassportCertCard[] = [];
  for (const cert of certs) {
    const imgs = imgsByCert.get(cert.id);
    if (!imgs?.length) continue;
    const tenant = tenantMap[cert.tenant_id];
    const network =
      imgs[0].polygon_network === "amoy" || imgs[0].polygon_network === "polygon"
        ? (imgs[0].polygon_network as "polygon" | "amoy")
        : null;
    cards.push({
      public_id: cert.public_id,
      service_type: cert.service_type,
      created_at: cert.created_at,
      shop_name: tenant?.name ?? tenant?.slug ?? null,
      anchored_image_count: imgs.length,
      primary_tx_hash: imgs[0].polygon_tx_hash,
      primary_tx_network: network,
      primary_explorer_url: buildExplorerUrl(imgs[0].polygon_tx_hash, network),
    });
  }

  if (!cards.length) return null;

  const metaNetwork =
    passport.meta_anchor_network === "amoy" || passport.meta_anchor_network === "polygon"
      ? (passport.meta_anchor_network as "polygon" | "amoy")
      : null;

  const metaAnchor: PassportMetaAnchor | null =
    passport.meta_anchor_hash && passport.meta_anchor_tx_hash && metaNetwork && passport.meta_anchor_anchored_at
      ? {
          hash: passport.meta_anchor_hash,
          tx_hash: passport.meta_anchor_tx_hash,
          network: metaNetwork,
          anchored_at: passport.meta_anchor_anchored_at,
          image_count: passport.meta_anchor_image_count,
          cert_count: passport.meta_anchor_cert_count,
          explorer_url: buildExplorerUrl(passport.meta_anchor_tx_hash, metaNetwork),
        }
      : null;

  return {
    vin_code_normalized: passport.vin_code_normalized,
    display_maker: passport.display_maker,
    display_model: passport.display_model,
    display_year: passport.display_year,
    anchored_cert_count: passport.anchored_cert_count,
    tenant_count: passport.tenant_count,
    first_seen_at: passport.first_seen_at,
    last_activity_at: passport.last_activity_at,
    certificates: cards,
    meta_anchor: metaAnchor,
  };
}
