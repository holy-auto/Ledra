import { enforceBilling } from "@/lib/billing/guard";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { renderBrandedCertificatePdf } from "@/lib/template-options/renderBrandedCertificate";
import {
  renderCertificatePdf,
  type CertRow,
  type AnchorInfo,
  type PdfMediaInfo,
  type PdfPhoto,
} from "@/lib/pdfCertificate";
import { loadPublicCertificateMedia } from "@/lib/certificateMedia/loadPublic";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import type { TemplateConfig } from "@/types/templateOption";

export const dynamic = "force-dynamic";

type CertPublic = {
  public_id: string;
  status: string;
  customer_name: string | null;
  vehicle_info_json: any | null;
  content_free_text: string | null;
  content_preset_json: any | null;
  expiry_type: string | null;
  expiry_value: string | null;
  logo_asset_path: string | null;
  footer_variant: string | null;
  current_version: number | null;
  created_at: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  tenant_custom_domain?: string | null;
  craftsman_name?: string | null;
};

function buildOriginFromCert(cert: { tenant_custom_domain?: string | null }, fallbackOrigin: string) {
  if (cert.tenant_custom_domain) return `https://${cert.tenant_custom_domain}`;
  if (process.env.APP_URL) return process.env.APP_URL;
  return fallbackOrigin;
}

async function getFallbackOrigin(): Promise<string> {
  const h = await headers(); // Next.js 16: Promise
  const xfProto = h.get("x-forwarded-proto");
  const xfHost = h.get("x-forwarded-host");
  const host = xfHost ?? h.get("host") ?? "localhost:3000";
  const proto = xfProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchCertPublic(pid: string): Promise<CertPublic | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const q = new URL(`${url}/rest/v1/certificates_public`);
  q.searchParams.set("select", "*");
  q.searchParams.set("public_id", `eq.${pid}`);
  q.searchParams.set("limit", "1");

  const res = await fetch(q.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });

  if (!res.ok) return null;
  const rows = (await res.json()) as CertPublic[];
  return rows?.[0] ?? null;
}

export async function GET(req: Request) {
  // Rate limit: 10 PDF generations per IP per minute (heavy operation)
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`pdf:${ip}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const deny = await enforceBilling(req, { minPlan: "free", action: "public_pdf" });
  if (deny) return deny;
  const { searchParams } = new URL(req.url);
  const pid = (searchParams.get("pid") ?? "").trim();

  // public_id の形式は過去に 32桁 hex だったが、新規発行やシード用途で
  // "LEDRA-DEMO-0001" のような英数ハイフン形式も許可する。
  // 長さ 6〜64、英数字とハイフンのみ、先頭は英数。
  if (!/^([a-f0-9]{32}|[A-Za-z0-9][A-Za-z0-9-]{5,63})$/.test(pid)) {
    return apiValidationError("無効な公開IDです。");
  }

  const cert = await fetchCertPublic(pid);
  if (!cert || (cert.status ?? "").toLowerCase() !== "active") {
    return apiNotFound("証明書が見つかりません。");
  }

  // 公開PDF閲覧ログ（tenant_id を取得して記録）
  try {
    const adm = createServiceRoleAdmin("public certificate PDF — lookup by public_id, caller is anonymous");
    const { data: certRow } = await adm
      .from("certificates")
      .select("tenant_id,id,vehicle_id")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();
    if (certRow?.tenant_id) {
      const meta = getRequestMeta(req);
      logCertificateAction({
        type: "certificate_public_pdf",
        tenantId: certRow.tenant_id as string,
        publicId: pid,
        certificateId: certRow.id as string,
        vehicleId: certRow.vehicle_id as string | null,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  } catch (e: unknown) {
    // audit log failure must not block PDF delivery, but we still want it in logs
    logger.warn("certificate pdf audit log failed", { err: e instanceof Error ? e.message : String(e) });
  }

  const fallbackOrigin = await getFallbackOrigin();
  const origin = buildOriginFromCert(cert, fallbackOrigin);
  const publicUrl = `${origin}/c/${cert.public_id}`;

  // 標準/ブランド両デザインで必要になる拡張カラムとアンカー情報をまとめて取得する。
  type FullCertRow = Pick<
    CertRow,
    | "ppf_coverage_json"
    | "service_type"
    | "coating_products_json"
    | "warranty_period_end"
    | "warranty_exclusions"
    | "current_version"
    | "maintenance_json"
    | "body_repair_json"
  > & { id: string; tenant_id: string | null; manufacturer_template_id: string | null };

  const adm = createServiceRoleAdmin("public certificate PDF — fetch full cert + anchors for rendering");
  const { data: fullCert } = await adm
    .from("certificates")
    .select(
      "id, tenant_id, ppf_coverage_json, service_type, coating_products_json, warranty_period_end, warranty_exclusions, current_version, maintenance_json, body_repair_json, manufacturer_template_id",
    )
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<FullCertRow>();

  let anchors: AnchorInfo[] = [];
  let photos: PdfPhoto[] = [];
  if (fullCert?.id) {
    const { data: images } = await adm
      .from("certificate_images")
      .select(
        "id, file_name, sort_order, sha256, polygon_tx_hash, polygon_network, storage_path, rendered_storage_path, annotations",
      )
      .eq("certificate_id", fullCert.id)
      .order("sort_order", { ascending: true });
    const allImages = images ?? [];

    anchors = allImages
      .filter((i) => i.polygon_tx_hash)
      .map((i) => ({
        sha256: (i.sha256 as string | null) ?? null,
        polygon_tx_hash: (i.polygon_tx_hash as string | null) ?? null,
        polygon_network:
          i.polygon_network === "polygon" || i.polygon_network === "amoy"
            ? (i.polygon_network as "polygon" | "amoy")
            : null,
      }));

    // Phase 2: PDF に貼る写真。rendered_storage_path があれば優先 (注釈焼き込み済み)、
    // なければ storage_path (原画像)。署名 URL は短命でも PDF レンダリング中に保てば十分。
    const photoCandidates = allImages.filter((i) => i.storage_path || i.rendered_storage_path);
    const resolvedPhotos = await Promise.all(
      photoCandidates.map(async (img): Promise<PdfPhoto | null> => {
        const path = (img.rendered_storage_path as string | null) ?? (img.storage_path as string | null);
        if (!path) return null;
        try {
          const { data } = await adm.storage.from(CERTIFICATE_IMAGE_BUCKET).createSignedUrl(path, 600);
          const url = data?.signedUrl;
          if (!url) return null;
          return {
            url,
            caption: (img.file_name as string | null) ?? null,
            annotated: !!img.annotations,
          };
        } catch {
          return null;
        }
      }),
    );
    photos = resolvedPhotos.filter((p): p is PdfPhoto => p !== null);
  }

  const certRow: CertRow = {
    public_id: cert.public_id,
    // 公開PDF は認証なしで誰でも取得できるため所有者名は出力しない (個人情報保護)。
    // ログイン発行など認証付きルート (admin/*, certificates/pdf-one 等) では実名を渡す。
    customer_name: "",
    vehicle_info_json: cert.vehicle_info_json ?? {},
    // 自由記述メモも公開(匿名)PDF では出力しない。Web 公開ページ (publicData) と同様に redact。
    content_free_text: null,
    content_preset_json: cert.content_preset_json ?? {},
    coating_products_json: fullCert?.coating_products_json ?? null,
    ppf_coverage_json: fullCert?.ppf_coverage_json ?? null,
    maintenance_json: fullCert?.maintenance_json ?? null,
    body_repair_json: fullCert?.body_repair_json ?? null,
    service_type: fullCert?.service_type ?? null,
    expiry_type: cert.expiry_type ?? null,
    expiry_value: cert.expiry_value ?? null,
    warranty_period_end: fullCert?.warranty_period_end ?? null,
    warranty_exclusions: fullCert?.warranty_exclusions ?? null,
    logo_asset_path: cert.logo_asset_path ?? null,
    created_at: cert.created_at ?? new Date().toISOString(),
    tenant_custom_domain: cert.tenant_custom_domain,
    current_version: fullCert?.current_version ?? null,
    // ⑦ 施工担当（職人）。certificates_public ビューが公開する craftsman_name をそのまま渡す。
    craftsman_name: cert.craftsman_name ?? null,
  };

  // ── メーカー指定デザインが選択されていればそれを最優先で描画 ──
  // テンプレート解決チェーン:
  //   1. 証明書 row が manufacturer_template_id を持つ
  //      → manufacturer_templates.config_json で描画 (発行時に
  //        certification 検証済みなのでここでは再検証しない)
  //   2. テナントがブランドテンプレートを購読中
  //      → tenant_template_configs.config_json で描画
  //   3. それ以外 → 標準デザイン
  try {
    if (fullCert?.manufacturer_template_id) {
      const { data: mfrTemplate } = await adm
        .from("manufacturer_templates")
        .select("config_json, is_active")
        .eq("id", fullCert.manufacturer_template_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (mfrTemplate?.config_json) {
        const brandedBuf = await renderBrandedCertificatePdf(
          certRow,
          publicUrl,
          mfrTemplate.config_json as TemplateConfig,
        );

        return new NextResponse(new Uint8Array(brandedBuf), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      }
    }
  } catch (mfrErr) {
    // メーカーテンプレ失敗時は次の解決ステップ (テナントブランド/標準) に
    // フォールバックする。証明書発行を完全に阻害しないことを優先。
    console.error("manufacturer template fallback:", mfrErr instanceof Error ? mfrErr.message : mfrErr);
  }

  // ── ブランドテンプレートが有効ならブランドPDFを生成 ──
  try {
    if (fullCert?.tenant_id) {
      const { data: activeSub } = await adm
        .from("tenant_option_subscriptions")
        .select("template_config_id")
        .eq("tenant_id", fullCert.tenant_id)
        .in("status", ["active", "past_due"])
        .limit(1)
        .maybeSingle();

      if (activeSub?.template_config_id) {
        const { data: tplConfig } = await adm
          .from("tenant_template_configs")
          .select("config_json, is_active")
          .eq("id", activeSub.template_config_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (tplConfig?.config_json) {
          const brandedBuf = await renderBrandedCertificatePdf(
            certRow,
            publicUrl,
            tplConfig.config_json as TemplateConfig,
          );

          // Copy out of Node's shared Buffer pool before handing to the
          // network layer, so later allocations can't overwrite our bytes.
          return new NextResponse(new Uint8Array(brandedBuf), {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }
  } catch (brandErr) {
    // ブランドテンプレ失敗時は標準テンプレにフォールバック
    console.error("branded template fallback:", brandErr instanceof Error ? brandErr.message : brandErr);
  }

  // Phase 3: interactive media (動画 / Before-After) を PDF に焼き込む。
  // 動画は poster + 公開ページ URL の QR、Before-After は 2 枚並列。
  let pdfMedia: PdfMediaInfo[] = [];
  try {
    const resolved = await loadPublicCertificateMedia(pid);
    pdfMedia = resolved
      .map<PdfMediaInfo | null>((m) => {
        if (m.media_type === "video") {
          return { kind: "video", posterUrl: m.poster_url, caption: m.caption };
        }
        if (m.media_type === "before_after" && m.before_url && m.url) {
          return { kind: "before_after", beforeUrl: m.before_url, afterUrl: m.url, caption: m.caption };
        }
        return null;
      })
      .filter((m): m is PdfMediaInfo => m !== null);
  } catch (e) {
    console.warn("[pdf] media load failed", e instanceof Error ? e.message : e);
  }

  // 標準デザイン（オプション未購入の全テナント共通）
  const buf = await renderCertificatePdf(certRow, publicUrl, anchors, pdfMedia, photos);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
