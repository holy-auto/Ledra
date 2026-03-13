import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CustomerActions from "./CustomerActions";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import { formatDate, formatDateTime } from "@/lib/format";

type PageProps = {
  params: Promise<{ public_id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PublicStatusResponse = {
  ok?: boolean;
  certificate?: {
    id?: string | null;
    tenant_id?: string | null;
    public_id?: string | null;
    vehicle_id?: string | null;
    status?: string | null;
    customer_name?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    vehicle_info_json?: any;
    content_free_text?: string | null;
    content_preset_json?: any;
    expiry_type?: string | null;
    expiry_value?: string | null;
    logo_asset_path?: string | null;
    footer_variant?: string | null;
    current_version?: string | null;
  };
  vehicle?: {
    id?: string | null;
    maker?: string | null;
    model?: string | null;
    year?: number | null;
    plate_display?: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    notes?: string | null;
  } | null;
  nfc?: {
    id?: string | null;
    tag_code?: string | null;
    status?: string | null;
    written_at?: string | null;
    attached_at?: string | null;
  } | null;
  histories?: Array<{
    id: string;
    type: string;
    title: string;
    description?: string | null;
    performed_at?: string | null;
    created_at?: string | null;
  }>;
  images?: Array<{
    id?: string | null;
    file_name?: string | null;
    content_type?: string | null;
    file_size?: number | null;
    sort_order?: number | null;
    created_at?: string | null;
    url?: string | null;
  }>;
  shop?: {
    name?: string | null;
    slug?: string | null;
    custom_domain?: string | null;
  } | null;
};

function asText(v: unknown) {
  return typeof v === "string" ? v : "";
}

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function pickVehicleField(vehicle: any, info: any, keys: string[]) {
  for (const key of keys) {
    const v1 = vehicle?.[key];
    if (v1 !== undefined && v1 !== null && String(v1).trim() !== "") return String(v1);

    const v2 = info?.[key];
    if (v2 !== undefined && v2 !== null && String(v2).trim() !== "") return String(v2);
  }
  return "";
}


function getStatusLabel(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return "有効な施工証明書";
  if (s === "void") return "無効の施工証明書";
  if (s === "expired") return "期限切れ";
  if (s === "inactive") return "停止";
  return status ?? "不明";
}

function getNfcStatusLabel(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "prepared") return "未書込";
  if (s === "written") return "書込済";
  if (s === "attached") return "貼付済";
  if (s === "lost") return "紛失";
  if (s === "retired") return "廃止";
  if (s === "error") return "エラー";
  return "未設定";
}

async function getOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function fetchPublicStatus(publicId: string): Promise<PublicStatusResponse | null> {
  const origin = await getOrigin();
  const res = await fetch(
    `${origin}/api/certificate/public-status?pid=${encodeURIComponent(publicId)}`,
    { cache: "no-store" }
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`public-status failed: ${res.status} ${txt}`);
  }

  return (await res.json()) as PublicStatusResponse;
}

export default async function CertificatePublicPage({ params, searchParams }: PageProps) {
  const { public_id } = await params;
  const publicId = public_id;

  const data = await fetchPublicStatus(publicId);
  if (!data?.certificate?.public_id) notFound();

  // 公開ページ閲覧ログ
  if (data.certificate.tenant_id) {
    const h = await headers();
    logCertificateAction({
      type: "certificate_public_viewed",
      tenantId: data.certificate.tenant_id,
      publicId: data.certificate.public_id,
      certificateId: data.certificate.id ?? undefined,
      vehicleId: data.certificate.vehicle_id ?? undefined,
      ip: h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent") ?? null,
    });
  }

  const origin = await getOrigin();
  const sp = await searchParams;
  const notice = Array.isArray(sp?.notice) ? sp?.notice[0] : sp?.notice;
  const certStatus = String(data.certificate.status ?? "").toLowerCase();
  const isVoidCertificate = certStatus === "void";

  const info = asObj(data.certificate.vehicle_info_json);
  const publicUrl = `${origin}/c/${data.certificate.public_id}`;
  const pdfHref = `/api/certificate/pdf?pid=${encodeURIComponent(data.certificate.public_id)}`;
  const returnTo = typeof sp?.returnTo === "string" ? sp.returnTo : undefined;
  const logoutHref = typeof sp?.logout === "string" ? sp.logout : undefined;

  const maker = pickVehicleField(data.vehicle, info, ["maker", "brand", "manufacturer"]);
  const model = pickVehicleField(data.vehicle, info, ["model", "car_model", "vehicle_model"]);
  const year = pickVehicleField(data.vehicle, info, ["year", "model_year"]);
  const plate = pickVehicleField(data.vehicle, info, ["plate_display", "plate", "plate_no", "number"]);
  const customerName = asText(data.certificate.customer_name);
  const freeText = asText(data.certificate.content_free_text);
  const images = !isVoidCertificate ? (data.images ?? []).filter((img) => !!img?.url) : [];

  const isPdfBlocked =
    notice === "pdf_blocked" ||
    notice === "pdf_blocked_grace_expired" ||
    notice === "pdf_blocked_inactive" ||
    notice === "pdf_blocked_plan";

  return (
    <main className="mx-auto max-w-[980px] p-4">
      <div className="glass-card mb-4 p-5">
        <div className="text-[28px] font-extrabold tracking-wide text-primary">CARTRUST CERT</div>
        <div className="mt-1 text-sm text-muted">施工証明書</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={`inline-block rounded-full border px-2.5 py-1.5 text-xs font-bold ${
              certStatus === "active"
                ? "border-emerald-500/30 bg-[rgba(16,185,129,0.1)] text-emerald-400"
                : certStatus === "void"
                  ? "border-red-500/30 bg-[rgba(239,68,68,0.1)] text-red-500"
                  : "border-amber-500/30 bg-[rgba(245,158,11,0.1)] text-amber-400"
            }`}
          >
            認証状態: {getStatusLabel(data.certificate.status)}
          </span>
          <span className="self-center text-xs text-secondary">
            Public ID: {data.certificate.public_id}
          </span>
        </div>
      </div>

      {certStatus !== "active" ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-4 text-amber-400">
          この証明書は現在「{getStatusLabel(data.certificate.status)}」状態です。存在は確認できますが、一部機能や扱いが通常と異なる場合があります。
        </div>
      ) : null}

      {isVoidCertificate ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-4 text-red-500">
          <div className="mb-1.5 font-extrabold">この証明書は無効化されています</div>
          <div className="text-sm leading-relaxed">
            この公開ページでは記録の存在確認のみ可能です。PDF出力と添付画像の公開表示は停止しています。詳細確認は発行店舗へお問い合わせください。
          </div>
        </div>
      ) : null}

      {isPdfBlocked ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-4 text-amber-400">
          <div className="mb-1.5 font-bold">現在、この証明書のPDFご案内を一時停止しています</div>
          <div className="text-sm leading-relaxed">
            このページの公開閲覧は引き続きご利用いただけますが、PDFのご案内は現在一時的に停止しています。
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">車両情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">メーカー: <span className="text-primary">{maker || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">車種: <span className="text-primary">{model || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">年式: <span className="text-primary">{year || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">ナンバー: <span className="text-primary">{plate || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">顧客名: <span className="text-primary">{customerName || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">記録作成日: <span className="text-primary">{formatDate(data.certificate.created_at)}</span></div>
          </div>
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">証明書情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">施工店: <span className="text-primary">{data.shop?.name || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">ステータス: <span className="text-primary">{getStatusLabel(data.certificate.status)}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">有効期限タイプ: <span className="text-primary">{asText(data.certificate.expiry_type) || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">有効期限値: <span className="text-primary">{data.certificate.expiry_value != null ? String(data.certificate.expiry_value) : "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">バージョン: <span className="text-primary">{data.certificate.current_version != null ? String(data.certificate.current_version) : "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              公開URL:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[#0071e3] hover:underline">
                {publicUrl}
              </a>
            </div>
          </div>
          {freeText ? (
            <div className="mt-3 whitespace-pre-wrap leading-relaxed text-secondary">
              {freeText}
            </div>
          ) : null}
        </section>

        {images.length > 0 ? (
          <section className="glass-card p-4">
            <div className="mb-3 font-bold text-primary">添付画像</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <a
                  key={String(img.id ?? img.sort_order ?? Math.random())}
                  href={String(img.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-border-default p-2.5 no-underline transition-colors hover:border-[#0071e3]/50 hover:bg-surface-hover"
                >
                  <img
                    src={String(img.url)}
                    alt={img.file_name || `image_${img.sort_order ?? ""}`}
                    className="h-[180px] w-full rounded-lg border border-border-default bg-base object-cover"
                  />
                  <div className="mt-2 text-xs text-muted">
                    {img.file_name || `image_${img.sort_order ?? "-"}`}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">NFC情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">状態: <span className="text-primary">{getNfcStatusLabel(data.nfc?.status)}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">タグコード: <span className="text-primary">{data.nfc?.tag_code || "-"}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">書込日時: <span className="text-primary">{formatDateTime(data.nfc?.written_at)}</span></div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">貼付日時: <span className="text-primary">{formatDateTime(data.nfc?.attached_at)}</span></div>
          </div>
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">履歴</div>

          {(data.histories?.length ?? 0) > 0 ? (
            <div className="grid gap-3">
              {data.histories?.map((row) => (
                <div key={row.id} className="rounded-xl border border-border-default bg-base p-3">
                  <div className="font-bold text-primary">{row.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(row.performed_at ?? row.created_at ?? null)} / {row.type}
                  </div>
                  {row.description ? (
                    <div className="mt-2 whitespace-pre-wrap leading-relaxed text-secondary">
                      {row.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">履歴はありません。</div>
          )}
        </section>
      </div>

      {!isVoidCertificate ? (
        <div className="mt-4">
          <CustomerActions
            pdfHref={pdfHref}
            returnTo={returnTo ?? undefined}
            logoutHref={logoutHref ?? undefined}
          />
        </div>
      ) : null}

      <footer className="mt-5 text-xs text-muted">
        この証明書は certificate.info により記録・管理されています
      </footer>
    </main>
  );
}