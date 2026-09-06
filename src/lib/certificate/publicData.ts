import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  resolveCertificateMedia,
  type CertificateMediaRow,
  type ResolvedCertificateMedia,
} from "@/lib/certificateMedia";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";

/**
 * scheduled_date (YYYY-MM-DD) と start_time (HH:MM[:SS]) を ISO 8601 文字列に
 * 結合する。両方欠ける場合は created_at にフォールバック (timeline 並び順用)。
 */
export function combineScheduledAt(date: string | null, time: string | null, fallback: string | null): string | null {
  if (!date) return fallback;
  const trimmedTime = time && /^\d{1,2}:\d{2}/.test(time) ? time : "00:00";
  // start_time may include seconds ("09:30:00") or microseconds; trim to HH:MM
  const hhmm = trimmedTime.slice(0, 5);
  const iso = `${date}T${hhmm}:00`;
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type CertRow = {
  id: string;
  tenant_id: string;
  public_id: string;
  vehicle_id: string | null;
  status: string;
  customer_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  vehicle_info_json: Json | null;
  content_free_text: string | null;
  content_preset_json: Json | null;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  footer_variant: string | null;
  current_version: number | null;
  service_type: string | null;
  ppf_coverage_json: Json | null;
  coating_products_json: Json | null;
  warranty_period_end: string | null;
  warranty_exclusions: string | null;
  maintenance_json: Json | null;
  body_repair_json: Json | null;
  accessory_json: Json | null;
  manufacturer_id: string | null;
  manufacturer_template_id: string | null;
  craftsman_name: string | null;
};

type ManufacturerPublicRow = {
  id: string;
  name: string;
  slug: string | null;
  logo_asset_path: string | null;
  website_url: string | null;
};

type TenantRow = {
  name: string | null;
  slug: string | null;
  custom_domain: string | null;
};

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
  customer_email: string | null;
  notes: string | null;
  vin_code_normalized: string | null;
};

type NfcRow = {
  id: string;
  tag_code: string | null;
  status: string | null;
  written_at: string | null;
  attached_at: string | null;
};

type HistoryRow = {
  id: string;
  type: string | null;
  title: string | null;
  description: string | null;
  performed_at: string | null;
  created_at: string | null;
};

/**
 * 公開タイムラインに出さない `vehicle_histories.type`。
 *
 * 「誰かが見た / PDF を出した」は車両の履歴ではなく**閲覧監査**で、
 * `logCertificateAction` の既定 description に**訪問者の IP や担当者の uid** が入る。
 * 中身ではなく型で落とす —— description の書式に依存しないので、
 * 監査種別が増えても漏れない。発行・編集・無効化は車両の出来事なので残す。
 */
const PRIVATE_HISTORY_TYPES = [
  "certificate_viewed",
  "certificate_pdf_generated",
  "certificate_pdf_batch",
  "certificate_public_viewed",
  "certificate_public_pdf",
] as const;

type ReservationRow = {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  created_at: string | null;
};

/** 公開向けに簡素化した予約レコード (customer 情報や担当者は含まない)。 */
export type PublicReservation = {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_at: string | null;
};

type ImageRow = {
  id: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  sort_order: number | null;
  created_at: string | null;
  storage_path: string | null;
  authenticity_grade: string | null;
  sha256: string | null;
  polygon_tx_hash: string | null;
  polygon_network: string | null;
  annotations: unknown;
  rendered_storage_path: string | null;
};

type VehicleCertRow = {
  id: string;
  public_id: string;
  status: string | null;
  customer_name: string | null;
  created_at: string | null;
  vehicle_info_json: Json | null;
  content_free_text: string | null;
  expiry_value: string | null;
};

export type PublicCertificateData = {
  ok: true;
  certificate: Omit<CertRow, "tenant_id" | "content_free_text" | "customer_name"> & {
    tenant_id?: undefined;
    content_free_text?: undefined;
    // 所有者名は公開(外部)表示では返さない (個人情報保護)。
    customer_name?: undefined;
  };
  vehicle:
    | (Omit<VehicleRow, "customer_name" | "customer_email" | "notes"> & {
        customer_name?: undefined;
        customer_email?: undefined;
        notes?: undefined;
      })
    | null;
  nfc: NfcRow | null;
  histories: HistoryRow[];
  images: (ImageRow & { url: string | null; rendered_url: string | null })[];
  media: ResolvedCertificateMedia[];
  reservations: PublicReservation[];
  vehicle_certificates: (Omit<VehicleCertRow, "content_free_text" | "customer_name"> & {
    content_free_text?: undefined;
    customer_name?: undefined;
  })[];
  vehicle_service_history_count: number;
  verification_url: string;
  days_until_expiry: number | null;
  warranty_active: boolean;
  shop: {
    name: string | null;
    slug: string | null;
    custom_domain: string | null;
  } | null;
  /**
   * Active manufacturer info when the certificate was issued under a
   * メーカー指定デザイン. The page surfaces this as a 認定施工店 badge.
   * Null when the certificate uses the standard or tenant-branded design.
   */
  manufacturer: ManufacturerPublicRow | null;
  /** Normalized VIN for the vehicle passport link. Non-null only when a passport record exists. */
  passport_vin: string | null;
};

/**
 * 公開証明書データを DB から直接取得する。
 * サーバーコンポーネント・Route Handler どちらからでも呼べる。
 * null → 証明書が存在しない (404 相当)
 */
export async function getPublicCertificateData(pid: string): Promise<PublicCertificateData | null> {
  const supabase = createServiceRoleAdmin("public certificate data — lookup by public_id, anonymous caller");

  const certRes = await supabase
    .from("certificates")
    .select(
      "id, tenant_id, public_id, vehicle_id, status, customer_name, created_at, updated_at, " +
        "vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, " +
        "logo_asset_path, footer_variant, current_version, service_type, ppf_coverage_json, " +
        "coating_products_json, warranty_period_end, warranty_exclusions, " +
        "maintenance_json, body_repair_json, accessory_json, manufacturer_id, manufacturer_template_id, craftsman_name",
    )
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<CertRow>();

  if (certRes.error) throw certRes.error;
  const cert = certRes.data;
  if (!cert?.tenant_id) return null;

  const [tenantRes, vehicleRes, nfcRes, histRes, imgRes, vcRes, mediaRes, reservationsRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, slug, custom_domain")
      .eq("id", cert.tenant_id)
      .limit(1)
      .maybeSingle<TenantRow>(),

    cert.vehicle_id
      ? supabase
          .from("vehicles")
          .select("id, maker, model, year, plate_display, notes, vin_code_normalized")
          .eq("id", cert.vehicle_id)
          .limit(1)
          .maybeSingle<VehicleRow>()
      : Promise.resolve({ data: null as VehicleRow | null, error: null }),

    supabase
      .from("nfc_tags")
      .select("id, tag_code, status, written_at, attached_at")
      .eq("certificate_id", cert.id)
      .limit(1)
      .maybeSingle<NfcRow>(),

    cert.vehicle_id
      ? supabase
          .from("vehicle_histories")
          .select("id, type, title, description, performed_at, created_at")
          .eq("vehicle_id", cert.vehicle_id)
          // **閲覧監査の行は公開しない。** `logCertificateAction` は description を
          // 省略されると `Public ID: … / User: <uid> / IP: <IP>` を組み立てる。
          // 公開ページの閲覧記録（`certificate_public_viewed` / `_public_pdf`）は
          // description を渡さず ip を渡すので、**訪問者の IP がそのまま入る**。
          // 管理画面の閲覧記録（`certificate_viewed`）には**担当者の uid** が入る。
          // この行は下の UnifiedTimeline が description をそのまま描画するので、
          // /c/[public_id]（未認証で開ける）に他人の IP と社内 uid が出ていた。
          //
          // そもそも「誰かが見た」は車両の履歴ではないので、公開タイムラインに
          // 出す意味がない。**型で落とすのが最小で確実**（description の中身に
          // 依存しないので、将来の監査種別が増えても漏れない）。
          // PR #1040 で発見。
          //
          // `.not("type","in",…)` 単体だと `type IS NULL` の行まで落ちる
          // （SQL の `NULL NOT IN (…)` は NULL＝偽扱い）。旧スキーマの行は type が
          // 空でありうる（描画側の `typeBadge(type: string | null)` がその想定）ので、
          // NULL は明示的に残す。
          .or(`type.is.null,type.not.in.(${PRIVATE_HISTORY_TYPES.join(",")})`)
          .order("performed_at", { ascending: false })
          .limit(50)
          .returns<HistoryRow[]>()
      : Promise.resolve({ data: [] as HistoryRow[], error: null }),

    supabase
      .from("certificate_images")
      .select(
        "id, file_name, content_type, file_size, sort_order, created_at, storage_path, authenticity_grade, sha256, polygon_tx_hash, polygon_network, annotations, rendered_storage_path",
      )
      .eq("certificate_id", cert.id)
      .order("sort_order", { ascending: true })
      .limit(20)
      .returns<ImageRow[]>(),

    cert.vehicle_id
      ? supabase
          .from("certificates")
          .select(
            "id, public_id, status, customer_name, created_at, vehicle_info_json, content_free_text, expiry_value",
          )
          .eq("vehicle_id", cert.vehicle_id)
          .neq("public_id", pid)
          .order("created_at", { ascending: false })
          .limit(20)
          .returns<VehicleCertRow[]>()
      : Promise.resolve({ data: [] as VehicleCertRow[], error: null }),

    supabase
      .from("certificate_media")
      .select(
        "id, media_type, storage_path, before_path, poster_path, duration_ms, width, height, caption, sort_order, content_type, file_size, created_at",
      )
      .eq("certificate_id", cert.id)
      .order("sort_order", { ascending: true })
      .limit(50)
      .returns<CertificateMediaRow[]>(),

    cert.vehicle_id
      ? supabase
          .from("reservations")
          .select("id, title, status, scheduled_date, start_time, created_at")
          .eq("vehicle_id", cert.vehicle_id)
          .in("status", ["arrived", "in_progress", "completed"])
          .order("scheduled_date", { ascending: false })
          .limit(20)
          .returns<ReservationRow[]>()
      : Promise.resolve({ data: [] as ReservationRow[], error: null }),
  ]);

  const tenant = tenantRes.data ?? null;
  const vehicle = vehicleRes.data ?? null;
  const nfc = nfcRes.data ?? null;
  const histories = histRes.data ?? [];
  const vehicle_certificates = vcRes.data ?? [];

  // Manufacturer info is fetched lazily only when the certificate was
  // issued under a manufacturer-fixed design — keeps the standard /c
  // page from paying a query for the common case.
  let manufacturer: ManufacturerPublicRow | null = null;
  if (cert.manufacturer_id) {
    const { data: mfrRow } = await supabase
      .from("manufacturers")
      .select("id, name, slug, logo_asset_path, website_url")
      .eq("id", cert.manufacturer_id)
      .eq("is_active", true)
      .maybeSingle<ManufacturerPublicRow>();
    manufacturer = mfrRow ?? null;
  }

  // Check for an existing vehicle passport (for the "view full history" badge)
  let passportVin: string | null = null;
  const vinNormalized = vehicle?.vin_code_normalized ?? null;
  if (vinNormalized) {
    const { data: passportRowRaw } = await supabase
      .from("vehicle_passports")
      .select("vin_code_normalized")
      .eq("vin_code_normalized", vinNormalized)
      .maybeSingle();
    const passportRow = passportRowRaw as { vin_code_normalized: string } | null;
    passportVin = passportRow?.vin_code_normalized ?? null;
  }

  const images: (ImageRow & { url: string | null; rendered_url: string | null })[] = (
    !imgRes.error && imgRes.data ? imgRes.data : []
  ).map((img) => {
    let url: string | null = null;
    if (img.storage_path) {
      const { data: signedData } = supabase.storage.from(CERTIFICATE_IMAGE_BUCKET).getPublicUrl(img.storage_path);
      url = signedData?.publicUrl ?? null;
    }
    let renderedUrl: string | null = null;
    if (img.rendered_storage_path) {
      const { data: signedData } = supabase.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .getPublicUrl(img.rendered_storage_path);
      renderedUrl = signedData?.publicUrl ?? null;
    }
    return { ...img, url, rendered_url: renderedUrl };
  });

  // certificate_media: void 状態のときは images と同じく公開しない
  const certStatusLower = String(cert.status ?? "").toLowerCase();
  const isVoid = certStatusLower === "void";
  const mediaRows = !mediaRes.error && mediaRes.data && !isVoid ? mediaRes.data : [];
  const media: ResolvedCertificateMedia[] = await Promise.all(
    mediaRows.map((row) => resolveCertificateMedia(supabase, row)),
  );

  // reservations: 来店以降のステータスのみ公開対象。日時は scheduled_date + start_time
  // から ISO 文字列に整形して、UnifiedTimeline 側でソートできるようにする。
  const reservations: PublicReservation[] = (
    !reservationsRes.error && reservationsRes.data && !isVoid ? reservationsRes.data : []
  ).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    scheduled_at: combineScheduledAt(r.scheduled_date, r.start_time, r.created_at),
  }));

  const vehicleServiceHistoryCount = vehicle_certificates.length;
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}`;

  let daysUntilExpiry: number | null = null;
  if (cert.expiry_value) {
    const expiryDate = new Date(cert.expiry_value);
    if (!isNaN(expiryDate.getTime())) {
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  const warrantyActive = cert.warranty_period_end != null && new Date(cert.warranty_period_end).getTime() > Date.now();

  return {
    ok: true,
    certificate: {
      ...cert,
      tenant_id: undefined as undefined,
      content_free_text: undefined as undefined,
      // 所有者名は公開(外部)表示では出力しない。認証付きの管理画面・PDF発行でのみ実名を扱う。
      customer_name: undefined as undefined,
    },
    vehicle: vehicle
      ? {
          ...vehicle,
          customer_name: undefined as undefined,
          customer_email: undefined as undefined,
          notes: undefined as undefined,
        }
      : null,
    nfc,
    histories,
    images,
    media,
    reservations,
    vehicle_certificates: vehicle_certificates.map((vc) => ({
      ...vc,
      content_free_text: undefined as undefined,
      customer_name: undefined as undefined,
    })),
    vehicle_service_history_count: vehicleServiceHistoryCount,
    verification_url: verificationUrl,
    days_until_expiry: daysUntilExpiry,
    warranty_active: warrantyActive,
    shop: tenant
      ? {
          name: tenant.name ?? tenant.slug ?? null,
          slug: tenant.slug ?? null,
          custom_domain: tenant.custom_domain ?? null,
        }
      : null,
    manufacturer,
    passport_vin: passportVin,
  };
}
