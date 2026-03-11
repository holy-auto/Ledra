import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  CERTIFICATE_IMAGE_BUCKET,
  formatCertificateImageBytes,
} from "@/lib/certificateImages";

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

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
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
      <main className="p-6">
        tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
      </main>
    );
  }

  const { data: row, error } = await supabase
    .from("certificates")
    .select("id,tenant_id,vehicle_id,public_id,status,customer_name,vehicle_info_json,content_free_text,content_preset_json,expiry_type,expiry_value,logo_asset_path,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .single();

  if (error || !row?.public_id) notFound();

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
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              CERTIFICATE DETAIL
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                証明書詳細
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                public_id ベースで証明書情報と出力導線、添付画像を確認します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <Link
              href="/admin/certificates"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              一覧へ
            </Link>

            <Link
              href={publicUrl}
              target="_blank"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              公開ページ
            </Link>

            {!isVoid ? (
              <>
                <Link
                  href={csvUrl}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  CSV(1件)
                </Link>
                <Link
                  href={pdfUrl}
                  target="_blank"
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  PDF(1件)
                </Link>
              </>
            ) : null}
          </div>
        </header>

        {isVoid ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
            この証明書は void（無効化）状態です。公開 / 出力は停止対象です。
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PUBLIC ID</div>
            <div className="mt-2 break-all font-mono text-sm text-neutral-900">{row.public_id}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">STATUS</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{row.status || "-"}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CUSTOMER</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{row.customer_name || "-"}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">IMAGES</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{images.length}枚</div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">BASIC</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">基本情報</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">作成日時</div>
                  <div className="mt-1 text-neutral-900">{fmt(row.created_at)}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">更新日時</div>
                  <div className="mt-1 text-neutral-900">{fmt(row.updated_at)}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">有効条件タイプ</div>
                  <div className="mt-1 text-neutral-900">{row.expiry_type || "-"}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">有効条件値</div>
                  <div className="mt-1 text-neutral-900">
                    {row.expiry_value != null ? String(row.expiry_value) : "-"}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLE INFO</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">車両情報</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">車種</div>
                  <div className="mt-1 text-neutral-900">{asText(info.model) || "-"}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">ナンバー</div>
                  <div className="mt-1 text-neutral-900">{asText(info.plate) || "-"}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">FREE TEXT</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">自由記述</div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4 text-sm whitespace-pre-wrap text-neutral-900">
                {row.content_free_text ? String(row.content_free_text) : "未入力"}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ATTACHED IMAGES</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">添付画像</div>
              </div>

              {images.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {images.map((img) => (
                    <div key={img.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                      {img.url ? (
                        <a href={img.url} target="_blank" rel="noreferrer">
                          <img
                            src={img.url}
                            alt={img.file_name ?? `image_${img.sort_order}`}
                            className="h-56 w-full rounded-xl border border-neutral-200 bg-white object-cover"
                          />
                        </a>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm text-neutral-400">
                          画像URLを生成できませんでした
                        </div>
                      )}

                      <div className="text-sm text-neutral-700">
                        <div>順序: {img.sort_order}</div>
                        <div className="break-all">ファイル名: {img.file_name || "-"}</div>
                        <div>サイズ: {formatCertificateImageBytes(img.file_size)}</div>
                        <div>保存日時: {fmt(img.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">添付画像はありません。</div>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">OUTPUT</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">出力導線</div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">公開ページ</div>
                  <div className="mt-1 break-all text-neutral-900">{publicUrl}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">CSV(1件)</div>
                  <div className="mt-1 break-all text-neutral-900">{csvUrl}</div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs text-neutral-500">PDF(1件)</div>
                  <div className="mt-1 break-all text-neutral-900">{pdfUrl}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PRESET SNAPSHOT</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">保存済み preset 情報</div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4 text-sm">
                <div className="text-xs text-neutral-500">template_name</div>
                <div className="mt-1 text-neutral-900">
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
    </main>
  );
}