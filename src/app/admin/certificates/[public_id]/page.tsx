import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient as createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CERTIFICATE_IMAGE_BUCKET,
  formatCertificateImageBytes,
} from "@/lib/certificateImages";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import PageHeader from "@/components/ui/PageHeader";
import AiExplainPanel from "@/components/certificates/AiExplainPanel";
import { formatDateTime } from "@/lib/format";

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

  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

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
    .select("id,tenant_id,vehicle_id,public_id,status,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,logo_asset_path,created_at,updated_at")
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
  const preset = asObj(row.content_preset_json);

  const publicUrl = `/c/${row.public_id}`;
  const csvUrl = `/admin/certificates/export-one?pid=${encodeURIComponent(row.public_id)}`;
  const pdfUrl = `/admin/certificates/pdf-one?pid=${encodeURIComponent(row.public_id)}`;

  const { data: imageRowsRaw } = await admin
    .from("certificate_images")
    .select("id,storage_path,file_name,content_type,file_size,sort_order,created_at")
    .eq("certificate_id", row.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const images = await Promise.all(
    (imageRowsRaw ?? []).map(async (img: any) => {
      let signedUrl: string | null = null;
      try {
        const signed = await admin.storage
          .from(CERTIFICATE_IMAGE_BUCKET)
          .createSignedUrl(img.storage_path, 3600);
        signedUrl = signed.data?.signedUrl ?? null;
      } catch {
        signedUrl = null;
      }

      return {
        id: img.id as string,
        file_name: (img.file_name as string | null) ?? null,
        content_type: (img.content_type as string | null) ?? null,
        file_size: Number(img.file_size ?? 0),
        sort_order: Number(img.sort_order ?? 0),
        created_at: (img.created_at as string | null) ?? null,
        url: signedUrl,
      };
    })
  );

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
          <section className="rounded-2xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-4 text-sm text-amber-400">
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
              {row.status === "active" ? "有効な施工証明書" : row.status === "void" ? "無効の施工証明書" : row.status || "-"}
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
                  <div className="mt-1 text-primary">
                    {row.expiry_value != null ? String(row.expiry_value) : "-"}
                  </div>
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

            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">ATTACHED IMAGES</div>
                <div className="mt-1 text-lg font-semibold text-primary">添付画像</div>
              </div>

              {images.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {images.map((img) => (
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
                    </div>
                  ))}
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

            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">OUTPUT</div>
                <div className="mt-1 text-lg font-semibold text-primary">出力導線</div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-base p-4">
                  <div className="text-xs text-muted">公開ページ</div>
                  <div className="mt-1 break-all text-primary">{publicUrl}</div>
                </div>

                <div className="rounded-xl bg-base p-4">
                  <div className="text-xs text-muted">CSV(1件)</div>
                  <div className="mt-1 break-all text-primary">{csvUrl}</div>
                </div>

                <div className="rounded-xl bg-base p-4">
                  <div className="text-xs text-muted">PDF(1件)</div>
                  <div className="mt-1 break-all text-primary">{pdfUrl}</div>
                </div>
              </div>
            </section>

            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">PRESET SNAPSHOT</div>
                <div className="mt-1 text-lg font-semibold text-primary">保存済み preset 情報</div>
              </div>

              <div className="rounded-xl bg-base p-4 text-sm">
                <div className="text-xs text-muted">template_name</div>
                <div className="mt-1 text-primary">
                  {preset.template_name ? String(preset.template_name) : "-"}
                </div>
              </div>

              <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 text-xs text-neutral-100">
{JSON.stringify(preset, null, 2)}
              </pre>
            </section>
          </aside>
        </div>
    </div>
  );
}
