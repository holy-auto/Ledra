import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET, formatCertificateImageBytes } from "@/lib/certificateImages";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import PageHeader from "@/components/ui/PageHeader";
import AiExplainPanel from "@/components/certificates/AiExplainPanel";
import SignatureRequestPanel from "./SignatureRequestPanel";
import CertEditForm from "./CertEditForm";
import CertEditHistory from "./CertEditHistory";
import CertImageUpload from "./CertImageUpload";
import CertImageDeleteButton from "./CertImageDeleteButton";
import MediaUploadSection from "./MediaUploadSection";
import PhotoTamperingPanel from "./PhotoTamperingPanel";
import QualityAutoPanel, { type AutoQualityResult } from "./QualityAutoPanel";
import { resolveCertificateMedia, type CertificateMediaRow } from "@/lib/certificateMedia";
import AnnotateExistingImageButton from "@/components/imageMarkup/AnnotateExistingImageButton";
import { isAnnotationDocument, type AnnotationDocument } from "@/components/imageMarkup/types";
import { formatDateTime } from "@/lib/format";
import AnchorBadge from "@/components/ui/AnchorBadge";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";

type PageProps = {
  params: Promise<{ public_id: string }>;
};

function asObj(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, any>;
}

function asText(v: unknown) {
  if (v == null) return "";
  return String(v);
}

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;

  const { data, error } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();

  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function Page({ params }: PageProps) {
  const { public_id } = await params;
  const publicId = (public_id ?? "").trim();

  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="text-sm text-muted">
        tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
      </div>
    );
  }

  const { admin } = createTenantScopedAdmin(tenantId);

  const { data: row, error } = await supabase
    .from("certificates")
    .select(
      "id,tenant_id,customer_id,vehicle_id,public_id,status,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,expiry_date,warranty_period_end,maintenance_date,warranty_exclusions,remarks,service_type,logo_asset_path,current_version,created_at,updated_at,meta",
    )
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .single();

  if (error || !row?.public_id) notFound();

  // アップロード時に自動付与された改ざんスクリーニング結果 (meta.tampering_check)。
  // source==="auto" のものだけをバッジ表示する (手動審査はパネルのボタンで都度実行)。
  const tamperingTc = (row.meta as Record<string, unknown> | null)?.tampering_check as
    | {
        source?: string;
        verdict?: "clear" | "suspicious" | "inconclusive";
        summary?: string;
        flagged_count?: number;
        image_count?: number;
        flags?: string[];
        vision_checked?: boolean;
        checked_at?: string | null;
      }
    | undefined;
  const autoTampering =
    tamperingTc && tamperingTc.source === "auto" && tamperingTc.verdict
      ? {
          verdict: tamperingTc.verdict,
          summary: tamperingTc.summary ?? "",
          flagged_count: tamperingTc.flagged_count ?? 0,
          image_count: tamperingTc.image_count ?? 0,
          flags: Array.isArray(tamperingTc.flags) ? tamperingTc.flags : [],
          vision_checked: !!tamperingTc.vision_checked,
          checked_at: tamperingTc.checked_at ?? null,
        }
      : null;

  // アップロード時に自動付与された品質・抜け漏れ監査結果 (meta.quality_check)。
  // source==="auto" のものだけをパネル表示する (手動チェックは作成フォーム側で実行)。
  const qualityQc = (row.meta as Record<string, unknown> | null)?.quality_check as
    | {
        source?: string;
        overall_status?: "pass" | "warning" | "fail" | "pending";
        standard_level?: string | null;
        score?: number;
        missing_photos?: string[];
        missing_fields?: string[];
        warnings?: Array<{ level: "error" | "warning" | "info"; message: string }>;
        image_count?: number;
        vision_checked?: boolean;
        checked_at?: string | null;
      }
    | undefined;
  const autoQuality: AutoQualityResult | null =
    qualityQc && qualityQc.source === "auto" && qualityQc.overall_status
      ? {
          overall_status: qualityQc.overall_status,
          standard_level: qualityQc.standard_level ?? null,
          score: typeof qualityQc.score === "number" ? qualityQc.score : 0,
          missing_photos: Array.isArray(qualityQc.missing_photos) ? qualityQc.missing_photos : [],
          missing_fields: Array.isArray(qualityQc.missing_fields) ? qualityQc.missing_fields : [],
          warnings: Array.isArray(qualityQc.warnings) ? qualityQc.warnings : [],
          image_count: typeof qualityQc.image_count === "number" ? qualityQc.image_count : 0,
          vision_checked: !!qualityQc.vision_checked,
          checked_at: qualityQc.checked_at ?? null,
        }
      : null;

  // 写真打刻: EXIF 撮影時刻から推定した施工日 / 作業時間 (meta.work_stamp)。
  // 提案の読み取り専用チップとして表示する (フォームへの反映は手入力。反映UIは後続で追加)。
  const workStampMeta = (row.meta as Record<string, unknown> | null)?.work_stamp as
    { source?: string; workDate?: string | null; workMinutes?: number | null; confidence?: string } | undefined;
  const autoWorkStamp =
    workStampMeta &&
    workStampMeta.source === "auto" &&
    (workStampMeta.workDate || typeof workStampMeta.workMinutes === "number")
      ? workStampMeta
      : null;

  // 施工内容ドラフト: 施工写真から AI が生成した施工内容の下書き (meta.content_draft_suggestion)。
  // 読み取り専用の提案チップ (施工内容欄への反映は手入力)。contentDraft が空の提案は表示しない。
  const contentDraftMeta = (row.meta as Record<string, unknown> | null)?.content_draft_suggestion as
    { source?: string; serviceCategory?: string; contentDraft?: string; confidence?: number } | undefined;
  const autoContentDraft =
    contentDraftMeta && contentDraftMeta.source === "auto" && (contentDraftMeta.contentDraft ?? "").trim()
      ? contentDraftMeta
      : null;

  // 閲覧ログ記録
  logCertificateAction({
    type: "certificate_viewed",
    tenantId,
    publicId: row.public_id as string,
    certificateId: row.id as string,
    vehicleId: row.vehicle_id as string | null,
    userId: userRes.user.id,
  });

  const isVoid = String(row.status ?? "").toLowerCase() === "void";
  const info = asObj(row.vehicle_info_json);

  const publicUrl = `/c/${row.public_id}`;
  const csvUrl = `/admin/certificates/export-one?pid=${encodeURIComponent(row.public_id)}`;
  const pdfUrl = `/admin/certificates/pdf-one?pid=${encodeURIComponent(row.public_id)}`;

  const { data: imageRowsRaw } = await admin
    .from("certificate_images")
    .select(
      "id,storage_path,file_name,content_type,file_size,sort_order,created_at,sha256,authenticity_grade,polygon_tx_hash,polygon_network,c2pa_verified,c2pa_manifest_cid,gps_check_verdict,gps_distance_bucket,annotations,rendered_storage_path",
    )
    .eq("certificate_id", row.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // 写真GPS × 店舗位置の整合性サマリ（結果のみ・生座標は保持していない）。
  // mismatch が1枚でもあれば注意、無くて match_store があれば確認済みとして表示。
  const gpsVerdicts = (imageRowsRaw ?? []).map((img: any) => (img.gps_check_verdict as string | null) ?? null);
  const gpsSummary: "warn" | "ok" | null = gpsVerdicts.includes("mismatch")
    ? "warn"
    : gpsVerdicts.includes("match_store")
      ? "ok"
      : null;

  const images = await Promise.all(
    (imageRowsRaw ?? []).map(async (img: any) => {
      let signedUrl: string | null = null;
      try {
        const signed = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).createSignedUrl(img.storage_path, 3600);
        signedUrl = signed.data?.signedUrl ?? null;
      } catch {
        signedUrl = null;
      }

      const polygonNetworkRaw = (img.polygon_network as string | null) ?? null;
      const polygonNetwork =
        polygonNetworkRaw === "polygon" || polygonNetworkRaw === "amoy"
          ? (polygonNetworkRaw as "polygon" | "amoy")
          : null;

      const annotations: AnnotationDocument | null = isAnnotationDocument(img.annotations)
        ? (img.annotations as AnnotationDocument)
        : null;

      return {
        id: img.id as string,
        file_name: (img.file_name as string | null) ?? null,
        content_type: (img.content_type as string | null) ?? null,
        file_size: Number(img.file_size ?? 0),
        sort_order: Number(img.sort_order ?? 0),
        created_at: (img.created_at as string | null) ?? null,
        url: signedUrl,
        sha256: (img.sha256 as string | null) ?? null,
        authenticity_grade: (img.authenticity_grade as string | null) ?? null,
        polygon_tx_hash: (img.polygon_tx_hash as string | null) ?? null,
        polygon_network: polygonNetwork,
        c2pa_verified: Boolean(img.c2pa_verified),
        c2pa_manifest_cid: (img.c2pa_manifest_cid as string | null) ?? null,
        annotations,
        rendered_storage_path: (img.rendered_storage_path as string | null) ?? null,
      };
    }),
  );

  // Aggregate blockchain stats for summary panel
  const anchoredCount = images.filter((i) => !!i.polygon_tx_hash).length;
  const pendingAnchorCount = images.filter((i) => !!i.sha256 && !i.polygon_tx_hash).length;

  // Phase 3 — interactive media (video / before_after / panorama360)
  const { data: mediaRowsRaw } = await admin
    .from("certificate_media")
    .select(
      "id, media_type, storage_path, before_path, poster_path, duration_ms, width, height, caption, sort_order, content_type, file_size, created_at",
    )
    .eq("certificate_id", row.id)
    .order("sort_order", { ascending: true })
    .returns<CertificateMediaRow[]>();
  const mediaResolved = await Promise.all((mediaRowsRaw ?? []).map((m) => resolveCertificateMedia(admin, m)));
  const adminMedia = mediaResolved.map((m) => ({
    id: m.id,
    media_type: m.media_type,
    caption: m.caption,
    url: m.url,
    before_url: m.before_url,
    poster_url: m.poster_url,
    sort_order: m.sort_order,
  }));

  // Plan tier → photo upload limit
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("plan_tier")
    .eq("id", tenantId)
    .single<{ plan_tier: string | null }>();
  const planTier = normalizePlanTier(tenantRow?.plan_tier);
  const maxPhotos = PHOTO_LIMITS[planTier];
  const remainingPhotos = Math.max(maxPhotos - images.length, 0);

  // Fetch edit history
  const { data: editHistoryRaw } = await admin
    .from("certificate_edit_histories")
    .select("id, version, changes, edited_by, created_at")
    .eq("certificate_id", row.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve editor emails
  const editorIds = [...new Set((editHistoryRaw ?? []).map((h: any) => h.edited_by).filter(Boolean))];
  const editorMap: Record<string, string> = {};
  for (const uid of editorIds) {
    const { data: userData } = await admin.auth.admin.getUserById(uid as string);
    if (userData?.user?.email) editorMap[uid as string] = userData.user.email;
  }

  const editHistory = (editHistoryRaw ?? []).map((h: any) => ({
    id: h.id as string,
    version: h.version as number,
    changes: h.changes as Array<{ field: string; label: string; old: unknown; new: unknown }>,
    edited_by: h.edited_by as string | null,
    editor_email: h.edited_by ? (editorMap[h.edited_by as string] ?? null) : null,
    created_at: h.created_at as string,
  }));

  // Prepare cert data for edit form
  const certForEdit = {
    public_id: row.public_id as string,
    customer_name: (row.customer_name as string) ?? "",
    vehicle_info_json: asObj(row.vehicle_info_json),
    content_free_text: row.content_free_text as string | null,
    expiry_value: row.expiry_value as string | null,
    expiry_date: row.expiry_date as string | null,
    warranty_period_end: row.warranty_period_end as string | null,
    maintenance_date: row.maintenance_date as string | null,
    warranty_exclusions: row.warranty_exclusions as string | null,
    remarks: row.remarks as string | null,
    service_type: row.service_type as string | null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="CERTIFICATE DETAIL"
        title="証明書詳細"
        description="public_id ベースで証明書情報と出力導線、添付画像を確認します。"
        actions={
          <div className="flex gap-3 items-center flex-wrap">
            <Link href="/admin/certificates" className="btn-secondary">
              一覧へ
            </Link>
            <Link href={publicUrl} target="_blank" className="btn-secondary">
              公開ページ
            </Link>
            {!isVoid ? (
              <>
                <Link href={csvUrl} className="btn-secondary">
                  CSV(1件)
                </Link>
                <Link href={pdfUrl} target="_blank" className="btn-secondary">
                  PDF(1件)
                </Link>
                {row.customer_id && (
                  <Link
                    href={`/admin/invoices/new?customer_id=${row.customer_id}${row.vehicle_id ? `&vehicle_id=${row.vehicle_id}` : ""}`}
                    className="btn-primary"
                  >
                    請求書を作成
                  </Link>
                )}
              </>
            ) : null}
          </div>
        }
      />

      {isVoid ? (
        <section className="rounded-2xl border border-warning/30 bg-warning-dim p-4 text-sm text-warning-text">
          この証明書は無効の施工証明書です。公開 / 出力は停止対象です。
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">PUBLIC ID</div>
          <div className="mt-2 break-all font-mono text-sm text-primary">{row.public_id}</div>
        </div>

        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">STATUS</div>
          <div className="mt-2 text-sm font-medium text-primary">
            {row.status === "active"
              ? "有効な施工証明書"
              : row.status === "void"
                ? "無効の施工証明書"
                : row.status || "-"}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CUSTOMER</div>
          {row.customer_id ? (
            <Link
              href={`/admin/customers/${row.customer_id}`}
              className="mt-2 block text-sm font-medium text-accent hover:underline"
            >
              {row.customer_name || row.customer_id}
            </Link>
          ) : (
            <div className="mt-2 text-sm font-medium text-primary">{row.customer_name || "-"}</div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">IMAGES</div>
          <div className="mt-2 text-sm font-medium text-primary">{images.length}枚</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="glass-card p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">BASIC</div>
              <div className="mt-1 text-lg font-semibold text-primary">基本情報</div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">作成日時</div>
                <div className="mt-1 text-primary">{formatDateTime(row.created_at)}</div>
              </div>

              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">更新日時</div>
                <div className="mt-1 text-primary">{formatDateTime(row.updated_at)}</div>
              </div>

              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">有効条件タイプ</div>
                <div className="mt-1 text-primary">{row.expiry_type || "-"}</div>
              </div>

              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">有効条件値</div>
                <div className="mt-1 text-primary">{row.expiry_value != null ? String(row.expiry_value) : "-"}</div>
              </div>
            </div>
          </section>

          <section className="glass-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">VEHICLE INFO</div>
                <div className="mt-1 text-lg font-semibold text-primary">車両情報</div>
              </div>
              {row.vehicle_id && (
                <Link href={`/admin/vehicles/${row.vehicle_id}`} className="text-xs text-accent hover:underline">
                  車両詳細 →
                </Link>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">車種</div>
                <div className="mt-1 text-primary">{asText(info.model) || "-"}</div>
              </div>

              <div className="rounded-xl bg-base p-4">
                <div className="text-xs text-muted">ナンバー</div>
                <div className="mt-1 text-primary">{asText(info.plate) || "-"}</div>
              </div>
            </div>
          </section>

          <section className="glass-card p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">FREE TEXT</div>
              <div className="mt-1 text-lg font-semibold text-primary">自由記述</div>
            </div>

            <div className="rounded-xl bg-base p-4 text-sm whitespace-pre-wrap text-primary">
              {row.content_free_text ? String(row.content_free_text) : "未入力"}
            </div>
          </section>

          {/* ── 編集フォーム ── */}
          {!isVoid && (
            <section>
              <CertEditForm cert={certForEdit} />
            </section>
          )}

          <section className="glass-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">ATTACHED IMAGES</div>
                <div className="mt-1 text-lg font-semibold text-primary">添付画像</div>
              </div>
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-success-dim px-2.5 py-1 text-success-text">
                    記録済 {anchoredCount}
                  </span>
                  {pendingAnchorCount > 0 ? (
                    <span className="rounded-full bg-warning-dim px-2.5 py-1 text-warning-text">
                      未記録 {pendingAnchorCount}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {!isVoid && (
              <CertImageUpload publicId={row.public_id as string} remaining={remainingPhotos} maxPhotos={maxPhotos} />
            )}

            {images.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {images.map((img) => {
                  const gradeLabel =
                    img.authenticity_grade === "premium"
                      ? "プレミアム"
                      : img.authenticity_grade === "verified"
                        ? "検証済"
                        : img.authenticity_grade === "basic"
                          ? "基本"
                          : "未検証";
                  const gradeColor =
                    img.authenticity_grade === "premium"
                      ? "bg-violet-dim text-violet-text"
                      : img.authenticity_grade === "verified"
                        ? "bg-success-dim text-success-text"
                        : img.authenticity_grade === "basic"
                          ? "bg-accent-dim text-accent-text"
                          : "bg-surface-hover text-muted";

                  const annotationCount = img.annotations?.annotations.length ?? 0;

                  return (
                    <div key={img.id} className="rounded-2xl border border-border-default bg-base p-3 space-y-3">
                      <div className="relative">
                        {img.url ? (
                          <a href={img.url} target="_blank" rel="noreferrer">
                            <img
                              src={img.url}
                              alt={img.file_name ?? `image_${img.sort_order}`}
                              className="h-56 w-full rounded-xl border border-border-default bg-surface object-cover"
                            />
                          </a>
                        ) : (
                          <div className="flex h-56 items-center justify-center rounded-xl border border-border-default bg-surface text-sm text-muted">
                            画像URLを生成できませんでした
                          </div>
                        )}
                        {annotationCount > 0 ? (
                          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            注釈 {annotationCount}
                          </span>
                        ) : null}
                      </div>

                      <div className="text-sm text-secondary">
                        <div>順序: {img.sort_order}</div>
                        <div className="break-all">ファイル名: {img.file_name || "-"}</div>
                        <div>サイズ: {formatCertificateImageBytes(img.file_size)}</div>
                        <div>保存日時: {formatDateTime(img.created_at)}</div>
                      </div>

                      {/* ── 真正性 / ブロックチェーン検証 ── */}
                      <div className="rounded-xl border border-border-default bg-surface p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold tracking-[0.18em] text-muted">AUTHENTICITY</span>
                          <span className={`rounded-full px-2 py-0.5 ${gradeColor}`}>{gradeLabel}</span>
                        </div>

                        <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-secondary">
                          <span className="text-muted">C2PA</span>
                          <span className={img.c2pa_verified ? "text-success" : "text-muted"}>
                            {img.c2pa_verified ? "署名あり" : "-"}
                          </span>

                          <span className="text-muted">SHA-256</span>
                          <span className="break-all font-mono text-[10px] text-secondary">
                            {img.sha256 ? `${img.sha256.slice(0, 16)}…` : "-"}
                          </span>

                          <span className="text-muted">Polygon</span>
                          {img.polygon_tx_hash && img.polygon_network ? (
                            <AnchorBadge txHash={img.polygon_tx_hash} network={img.polygon_network} />
                          ) : img.sha256 ? (
                            <span className="text-warning">未記録</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}

                          {img.polygon_tx_hash ? (
                            <>
                              <span className="text-muted">ネットワーク</span>
                              <span className="text-secondary">
                                {img.polygon_network === "amoy" ? "Amoy (testnet)" : "Polygon mainnet"}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {!isVoid && (
                        <div className="flex flex-wrap items-center gap-2">
                          {img.url ? (
                            <AnnotateExistingImageButton
                              imageId={img.id}
                              imageUrl={img.url}
                              initial={img.annotations}
                              fileName={img.file_name}
                            />
                          ) : null}
                          <CertImageDeleteButton imageId={img.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-base p-4 text-sm text-muted">添付画像はありません。</div>
            )}
          </section>

          {!isVoid && <MediaUploadSection publicId={row.public_id as string} existing={adminMedia} />}
        </div>

        <aside className="space-y-6">
          {/* AI説明変換パネル（B-2） */}
          <section className="glass-card p-5">
            <AiExplainPanel certificateId={row.id as string} />
          </section>

          {/* 写真改ざん検出 */}
          {images.length > 0 && (
            <PhotoTamperingPanel
              certificateId={row.id as string}
              photoUrls={images.map((img) => img.url).filter((u): u is string => !!u)}
              autoResult={autoTampering}
            />
          )}

          {/* 写真品質・抜け漏れ監査 (アップロード時に自動付与された結果のみ表示) */}
          {autoQuality && <QualityAutoPanel result={autoQuality} />}

          {/* 写真打刻: EXIF 撮影時刻からの施工日 / 作業時間の推定 (読み取り専用の提案) */}
          {autoWorkStamp && (
            <section className="glass-card p-5 space-y-2">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTO WORK STAMP</div>
              <div className="mt-1 text-lg font-semibold text-primary">写真からの推定</div>
              <div className="text-sm text-primary">
                {autoWorkStamp.workDate && <span>施工日: {autoWorkStamp.workDate}</span>}
                {typeof autoWorkStamp.workMinutes === "number" && (
                  <span className="ml-3">作業時間: 約{autoWorkStamp.workMinutes}分</span>
                )}
              </div>
              <p className="text-xs text-muted">
                施工写真の EXIF 撮影時刻からの推定です。内容欄への反映は手入力で行ってください。
                {autoWorkStamp.confidence === "low" ? "（精度: 低 — 写真の撮影時刻がばらついています）" : ""}
              </p>
            </section>
          )}

          {/* 写真GPS × 店舗位置の整合性（結果のみ・生座標は保持していない） */}
          {gpsSummary && (
            <section className="glass-card p-5 space-y-2">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTO LOCATION</div>
              <div className="mt-1 text-lg font-semibold text-primary">撮影場所の整合性</div>
              {gpsSummary === "ok" ? (
                <p className="text-sm text-primary">写真は店舗付近で撮影されています（GPS照合済み）。</p>
              ) : (
                <p className="text-sm text-danger">
                  一部の写真が店舗から離れた場所で撮影されています。出張作業でなければ確認してください。
                </p>
              )}
              <p className="text-xs text-muted">
                写真の位置情報と店舗座標の照合結果です。プライバシー保護のため、生のGPS座標は保存していません。
              </p>
            </section>
          )}

          {/* 施工内容ドラフト: 施工写真から AI が生成した下書き (読み取り専用の提案) */}
          {autoContentDraft && (
            <section className="glass-card p-5 space-y-2">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">CONTENT DRAFT</div>
              <div className="mt-1 text-lg font-semibold text-primary">写真からの施工内容ドラフト</div>
              <p className="whitespace-pre-wrap text-sm text-primary">{autoContentDraft.contentDraft}</p>
              <p className="text-xs text-muted">
                施工写真から AI
                が生成した下書きです。内容欄への反映・修正は手入力で行ってください（発行前に必ず内容をご確認ください）。
              </p>
            </section>
          )}

          {/* 電子署名依頼パネル */}
          {!isVoid && (
            <section className="glass-card p-5 space-y-3">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">ELECTRONIC SIGNATURE</div>
                <div className="mt-1 text-lg font-semibold text-primary">電子署名</div>
              </div>
              <SignatureRequestPanel certificateId={row.id as string} />
            </section>
          )}

          {/* 編集履歴 */}
          <section className="glass-card p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">EDIT HISTORY</div>
              <div className="mt-1 text-lg font-semibold text-primary">編集履歴</div>
              {row.current_version && Number(row.current_version) > 1 && (
                <div className="mt-1 text-xs text-muted">現在 v{String(row.current_version)}</div>
              )}
            </div>
            <CertEditHistory entries={editHistory} />
          </section>
        </aside>
      </div>
    </div>
  );
}
