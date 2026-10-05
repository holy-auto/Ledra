import { enforceBilling, isNavigation, redirectToPublic } from "@/lib/billing/guard";
import { electronicDeliveryBlockMessage, BLOCKED_UNVERIFIED } from "@/lib/delivery/deliveryConsent";
import { isValidStaffPdfToken } from "@/lib/certificates/staffPdfLink";
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
import { omitPlate } from "@/lib/certificates/publicData";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages/constants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { TemplateConfig } from "@/types/templateOption";

export const dynamic = "force-dynamic";

const PUBLIC_PDF_CONSENT_BLOCKED =
  "電子データでのお渡しに必要なご承諾が確認できないため、PDFは出力できません。書面でのお渡しは発行店舗へお問い合わせください。";
const PUBLIC_PDF_UNAVAILABLE = "現在PDFを出力できません。時間をおいて再度お試しください。";

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

// 公開ビュー certificates_public（customer_name / content_free_text を NULL 化済み）をサーバー側で読む。
// 以前は anon キーで REST を叩いていたため、anon に certificates の SELECT（active 全件）を
// 開けておく必要があり、anon キーだけで全テナントの顧客名が読めていた。
// active 以外を返さないのは下の GET の status チェックが担う。
async function fetchCertPublic(pid: string): Promise<CertPublic | null> {
  const { data, error } = await createServiceRoleAdmin("public certificate PDF — certificates_public by public_id")
    .from("certificates_public")
    .select("*")
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<CertPublic>();
  if (error) throw error;
  return data;
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
    | "accessory_json"
  > & {
    id: string;
    tenant_id: string | null;
    vehicle_id: string | null;
    customer_id: string | null;
    manufacturer_template_id: string | null;
  };

  const adm = createServiceRoleAdmin("public certificate PDF — fetch full cert + anchors for rendering");
  const { data: fullCert, error: fullErr } = await adm
    .from("certificates")
    .select(
      "id, tenant_id, vehicle_id, customer_id, ppf_coverage_json, service_type, coating_products_json, warranty_period_end, warranty_exclusions, current_version, maintenance_json, body_repair_json, accessory_json, manufacturer_template_id",
    )
    .eq("public_id", pid)
    .limit(1)
    .maybeSingle<FullCertRow>();

  // 電子交付の承諾ゲート（G3/G4）: 公開 PDF は記録簿の写しの電子交付経路。承諾を撤回した顧客
  // （事前承諾を必須にしたテナントでは未承諾・顧客未紐付けも）には出さない。公開ページの閲覧自体は止めない。
  // 判定できない（DB 一時障害）ときも出さないが、承諾の問題とは言わず再試行を案内する。
  // 店舗スタッフが書面交付用に印刷する場合（モバイルが発行する期限付き署名 st）は承諾ゲートを通さない（staffPdfLink.ts）。
  const staffToken = (searchParams.get("st") ?? "").trim();
  const byStaff = !!(staffToken && fullCert?.tenant_id && isValidStaffPdfToken(staffToken, pid, fullCert.tenant_id));
  const blocked =
    fullErr || !fullCert?.tenant_id
      ? BLOCKED_UNVERIFIED
      : byStaff
        ? null
        : await electronicDeliveryBlockMessage(adm, fullCert.tenant_id, fullCert.customer_id ?? null);
  if (blocked || !fullCert?.tenant_id) {
    const transient = blocked === BLOCKED_UNVERIFIED || !blocked;
    if (isNavigation(req)) {
      const loc = new URL(redirectToPublic(pid, transient ? "pdf_unavailable" : "pdf_blocked_consent"), req.url);
      return new Response(null, { status: 303, headers: { Location: loc.toString() } });
    }
    // 匿名の呼び出し元に、店舗向けの理由（撤回の有無・テナント設定）は返さない。
    return transient
      ? apiJson({ error: "temporarily_unavailable", message: PUBLIC_PDF_UNAVAILABLE }, { status: 503 })
      : apiJson({ error: "delivery_consent_blocked", message: PUBLIC_PDF_CONSENT_BLOCKED }, { status: 403 });
  }

  // 公開PDF閲覧ログ（PDF を出すときだけ）。スタッフ署名での出力は、誰が出したかを発行時（pdf-link）に記録済みなので
  // ここでは種類を分けて残す（監査でお客様の閲覧と区別できるように）。
  const meta = getRequestMeta(req);
  logCertificateAction({
    type: byStaff ? "certificate_pdf_generated" : "certificate_public_pdf",
    ...(byStaff ? { description: `スタッフ用 PDF リンクで出力（書面交付用） / Public ID: ${pid}` } : {}),
    tenantId: fullCert.tenant_id,
    publicId: pid,
    certificateId: fullCert.id,
    vehicleId: fullCert.vehicle_id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const fallbackOrigin = await getFallbackOrigin();
  const origin = buildOriginFromCert(cert, fallbackOrigin);
  const publicUrl = `${origin}/c/${cert.public_id}`;

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
    // renderCertificatePdf は先頭 8 枚だけ描画するため、sort_order 順 (取得時点でソート済み) の
    // 先頭 8 枚に絞ってから署名する。全件署名すると未使用 URL の生成で無駄な往復が発生する。
    const photoCandidates = allImages.filter((i) => i.storage_path || i.rendered_storage_path).slice(0, 8);
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
    // ナンバーも公開(匿名)PDF では出力しない。/c ページ (publicData) と同じ omitPlate を通す。
    vehicle_info_json: omitPlate(cert.vehicle_info_json ?? {}),
    // 自由記述メモも公開(匿名)PDF では出力しない。Web 公開ページ (publicData) と同様に redact。
    content_free_text: null,
    content_preset_json: cert.content_preset_json ?? {},
    coating_products_json: fullCert?.coating_products_json ?? null,
    ppf_coverage_json: fullCert?.ppf_coverage_json ?? null,
    maintenance_json: fullCert?.maintenance_json ?? null,
    body_repair_json: fullCert?.body_repair_json ?? null,
    accessory_json: fullCert?.accessory_json ?? null,
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
  // @react-pdf は <Image> の取得に1枚でも失敗 (署名URL期限切れ / 配信先ダウン等) すると
  // レンダリング全体を throw する。写真/メディアは付加情報なので、失敗したら写真・メディア
  // 抜きで1回だけ再描画し、本質 (QR / オンチェーンアンカー) を含む証明書は必ず配信する。
  // batch-pdf ワーカーが per-cert で isolate しているのと同じ堅牢性を単発配信でも担保する。
  let buf: Awaited<ReturnType<typeof renderCertificatePdf>>;
  try {
    buf = await renderCertificatePdf(certRow, publicUrl, anchors, pdfMedia, photos);
  } catch (renderErr) {
    console.error(
      "[pdf] cert render failed, retrying without photos/media:",
      renderErr instanceof Error ? renderErr.message : renderErr,
    );
    buf = await renderCertificatePdf(certRow, publicUrl, anchors);
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate_${cert.public_id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
