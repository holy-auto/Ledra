import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { todayInJst } from "@/lib/retention";
import { OUTWARD_VISIBLE_TYPES } from "@/lib/audit/certificateLog";
import {
  resolveCertificateMedia,
  type CertificateMediaRow,
  type ResolvedCertificateMedia,
} from "@/lib/certificateMedia";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages/constants";
import {
  canViewCertificateDetails,
  DETAIL_ACCESS_COLUMNS,
  redactCertificateDetails,
  type DetailAccessCert,
} from "@/lib/certificates/detailAccess";

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

/**
 * vehicle_info_json に発行時スナップショットとして入るナンバーのキー。
 * `plate` は certificates/create.ts が書く。残りは旧データ・外部取込で /c ページが拾っていたキー。
 */
const PLATE_KEYS = ["plate", "plate_display", "plate_no", "number"];

/**
 * 匿名閲覧向けに vehicle_info_json からナンバーを落とす。
 * ナンバーは VEHICLE_TABLE_PII_COLUMNS で PII 分類済み（rendition.ts も tenant_internal 未満で null 化）。
 * vehicles.plate_display を伏せても、ここに同じ値が残っていると公開ページ・公開 PDF に出る。
 */
export function omitPlate<T>(vehicleInfo: T): T {
  if (!vehicleInfo || typeof vehicleInfo !== "object" || Array.isArray(vehicleInfo)) return vehicleInfo;
  const rest = { ...(vehicleInfo as Record<string, unknown>) };
  for (const k of PLATE_KEYS) delete rest[k];
  return rest as T;
}

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
  damage_map_json: Json | null;
  manufacturer_id: string | null;
  manufacturer_template_id: string | null;
  craftsman_name: string | null;
} & DetailAccessCert;

/** 閲覧者の判定にだけ使う列。公開の応答には載せない。 */
type DetailAccessOnly = "customer_id" | "customer_phone_last4_hash" | "hidden_from_owner_portal_at";

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
  certificate: Omit<CertRow, "tenant_id" | "content_free_text" | "customer_name" | DetailAccessOnly> & {
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
  /**
   * 写真・個人情報（担当者名・作業メモ・予約名）を出しているか。作業店舗・所有者・履歴レポート購入者のときだけ true
   * （detailAccess.ts）。false のとき images は URL・保存パス無し（件数と認証グレードだけ）、media は空。
   */
  detail_visible: boolean;
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
      // tenant_id / vehicle_id / created_at は DETAIL_ACCESS_COLUMNS に含まれる
      "id, public_id, status, customer_name, updated_at, " +
        "vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, " +
        "logo_asset_path, footer_variant, current_version, service_type, ppf_coverage_json, " +
        "coating_products_json, warranty_period_end, warranty_exclusions, " +
        "maintenance_json, body_repair_json, accessory_json, damage_map_json, manufacturer_id, manufacturer_template_id, craftsman_name, " +
        DETAIL_ACCESS_COLUMNS,
    )
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<CertRow>();

  if (certRes.error) throw certRes.error;
  const cert = certRes.data;
  if (!cert?.tenant_id) return null;

  const [detailVisible, tenantRes, vehicleRes, nfcRes, histRes, imgRes, vcRes, mediaRes, reservationsRes] =
    await Promise.all([
      canViewCertificateDetails(cert),
      supabase
        .from("tenants")
        .select("name, slug, custom_domain")
        .eq("id", cert.tenant_id)
        .limit(1)
        .maybeSingle<TenantRow>(),

      cert.vehicle_id
        ? supabase
            .from("vehicles")
            // plate_display は PII（VEHICLE_TABLE_PII_COLUMNS）。匿名ページには取得もしない。
            .select("id, maker, model, year, notes, vin_code_normalized")
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
            // **見せてよい種別だけを通す（許可リスト）。**
            // `vehicle_histories` は車両の履歴と監査ログが同居していて、閲覧監査の
            // 本文には訪問者の IP と社内 uid が、`member_added` や `note` には
            // メールアドレスが入る。下の UnifiedTimeline は description をそのまま
            // 描画するので、**知らない種別は出さない**のが唯一安全な既定。
            // 分類は `audit/certificateLog.ts` の OUTWARD_VISIBLE に1箇所で持つ。
            .in("type", OUTWARD_VISIBLE_TYPES)
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
    // 写真を見せない閲覧者には URL・注釈・ファイル名を渡さない（件数と認証グレードだけ残す）。
    // assets バケットは公開なので、パスだけでも写真に届く。パスも落とす。
    if (!detailVisible)
      return {
        ...img,
        storage_path: null,
        rendered_storage_path: null,
        file_name: null,
        annotations: null,
        url: null,
        rendered_url: null,
      };
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
  const mediaRows = !mediaRes.error && mediaRes.data && !isVoid && detailVisible ? mediaRes.data : [];
  const media: ResolvedCertificateMedia[] = await Promise.all(
    mediaRows.map((row) => resolveCertificateMedia(supabase, row)),
  );

  // reservations: 来店以降のステータスのみ公開対象。日時は scheduled_date + start_time
  // から ISO 文字列に整形して、UnifiedTimeline 側でソートできるようにする。
  const reservations: PublicReservation[] = (
    !reservationsRes.error && reservationsRes.data && !isVoid ? reservationsRes.data : []
  ).map((r) => ({
    id: r.id,
    // 予約名は顧客名が入りがち（「山田様 コーティング」等）
    title: detailVisible ? r.title : null,
    status: r.status,
    scheduled_at: combineScheduledAt(r.scheduled_date, r.start_time, r.created_at),
  }));

  // 判定用の列（顧客 ID・電話ハッシュ）は応答に載せない
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customer_id, customer_phone_last4_hash, hidden_from_owner_portal_at, ...certFields } = cert;

  const vehicleServiceHistoryCount = vehicle_certificates.length;
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}`;

  let daysUntilExpiry: number | null = null;
  if (cert.expiry_value) {
    const expiryDate = new Date(cert.expiry_value);
    if (!isNaN(expiryDate.getTime())) {
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  // 保証期限は date 型。UTC 0 時と比べると最終日の 9:00 JST で切れるので、JST の今日と日付どうしで比べる。
  const warrantyActive =
    cert.warranty_period_end != null && String(cert.warranty_period_end).slice(0, 10) >= todayInJst();

  return {
    ok: true,
    certificate: {
      ...(detailVisible ? certFields : redactCertificateDetails(certFields)),
      vehicle_info_json: omitPlate(cert.vehicle_info_json),
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
      vehicle_info_json: omitPlate(vc.vehicle_info_json),
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
    detail_visible: detailVisible,
  };
}
