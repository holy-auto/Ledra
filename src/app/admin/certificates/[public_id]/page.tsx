import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient as createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET, formatCertificateImageBytes } from "@/lib/certificateImages";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import PageHeader from "@/components/ui/PageHeader";
import AiExplainPanel from "@/components/certificates/AiExplainPanel";
import SignatureRequestPanel from "./SignatureRequestPanel";
import CertEditForm from "./CertEditForm";
import CertEditHistory from "./CertEditHistory";
import CertImageUpload from "./CertImageUpload";
import { formatDateTime } from "@/lib/format";
import { buildExplorerUrl } from "@/lib/anchoring/providers";
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
  const admin = createSupabaseAdminClient();

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

  const { data: row, error } = await supabase
    .from("certificates")
    .select(
      "id,tenant_id,vehicle_id,public_id,status,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,expiry_date,warranty_period_end,maintenance_date,warranty_exclusions,remarks,service_type,logo_asset_path,current_version,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .single();

  if (error || !row?.public_id) notFound();

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
      "id,storage_path,file_name,content_type,file_size,sort_order,created_at,sha256,authenticity_grade,polygon_tx_hash,polygon_network,c2pa_verified,c2pa_manifest_cid",
    )
    .eq("certificate_id", row.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

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
      };
    }),
  );

  // Aggregate blockchain stats for summary panel
  const anchoredCount = images.filter((i) => !!i.polygon_tx_hash).length;
  const pendingAnchorCount = images.filter((i) => !!i.sha256 && !i.polygon_tx_hash).length;

  // Plan tier → photo upload limit
  const { data: tenantRow } = await admin.from("tenants").select("plan_tier").eq("id", tenantId).single();
  const planTier = normalizePlanTier((tenantRow as any)?.plan_tier);
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
          <div className="mt-2 text-sm font-medium text-primary">{row.customer_name || "-"}</div>
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
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">VEHICLE INFO</div>
              <div className="mt-1 text-lg font-semibold text-primary">車両情報</div>
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
              <CertImageUpload
                publicId={row.public_id as string}
                remaining={remainingPhotos}
                maxPhotos={maxPhotos}
              />
            )}

            {images.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {images.map((img) => {
                  const explorerUrl = buildExplorerUrl(img.polygon_tx_hash, img.polygon_network);
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

                  return (
                    <div key={img.id} className="rounded-2xl border border-border-default bg-base p-3 space-y-3">
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
                          {explorerUrl ? (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all text-success hover:underline"
                              title={`${img.polygon_network === "amoy" ? "Amoy testnet" : "Polygon mainnet"} で検証`}
                            >
                              {img.polygon_tx_hash?.slice(0, 16)}… ↗
                            </a>
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-base p-4 text-sm text-muted">添付画像はありません。</div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {/* AI説明変換パネル（B-2） */}
          <section className="glass-card p-5">
            <AiExplainPanel certificateId={row.id as string} />
          </section>

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
