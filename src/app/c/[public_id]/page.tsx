import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CustomerActions from "./CustomerActions";
import InquiryForm from "./InquiryForm";
import ShopContact from "./ShopContact";

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
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_line?: string | null;
  contact_note?: string | null;
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

function formatDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

function getStatusLabel(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return "有効";
  if (s === "void") return "無効";
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-neutral-900">{value || "-"}</div>
    </div>
  );
}

export default async function CertificatePublicPage({ params, searchParams }: PageProps) {
  const { public_id } = await params;
  const publicId = public_id;

  const data = await fetchPublicStatus(publicId);
  if (!data?.certificate?.public_id) notFound();

  const origin = await getOrigin();
  const sp = await searchParams;
  const notice = Array.isArray(sp?.notice) ? sp?.notice[0] : sp?.notice;
  const certStatus = String(data.certificate.status ?? "").toLowerCase();
  const isVoidCertificate = certStatus === "void";
  const isActive = certStatus === "active";

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

  const statusBadgeClass = isActive
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isVoidCertificate
    ? "bg-red-50 text-red-700 border-red-200"
    : "bg-amber-50 text-amber-700 border-amber-200";

  const hasNfc = !!data.nfc?.tag_code;
  const hasHistories = (data.histories?.length ?? 0) > 0;

  return (
    <main className="min-h-screen bg-neutral-50 pb-16">
      {/* Hero header */}
      <div className="bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-5">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-neutral-400">CARTRUST</div>
              <div className="text-xl font-extrabold tracking-tight text-neutral-900 leading-none mt-0.5">
                施工証明書
              </div>
            </div>
          </div>

          {/* Status + ID */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive ? "bg-emerald-500" : isVoidCertificate ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              {getStatusLabel(data.certificate.status)}
            </span>
            <span className="font-mono text-xs text-neutral-500">
              {data.certificate.public_id}
            </span>
          </div>

          {/* Shop name */}
          {data.shop?.name ? (
            <p className="mt-3 text-sm text-neutral-600">
              発行店舗：<span className="font-semibold text-neutral-900">{data.shop.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 space-y-4">
        {/* Banners */}
        {!isActive && !isVoidCertificate ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            この証明書は現在「{getStatusLabel(data.certificate.status)}」状態です。
            存在は確認できますが、一部機能や扱いが通常と異なる場合があります。
          </div>
        ) : null}

        {isVoidCertificate ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="text-sm font-bold text-red-800 mb-1">この証明書は無効化されています</div>
            <p className="text-sm leading-relaxed text-red-700">
              この公開ページでは記録の存在確認のみ可能です。PDF出力と添付画像の公開表示は停止しています。
              詳細確認は発行店舗へお問い合わせください。
            </p>
          </div>
        ) : null}

        {isPdfBlocked ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="text-sm font-bold text-amber-800 mb-1">
              現在、PDFのご案内を一時停止しています
            </div>
            <p className="text-sm leading-relaxed text-amber-700">
              このページの公開閲覧は引き続きご利用いただけますが、PDFのご案内は現在一時的に停止しています。
            </p>
          </div>
        ) : null}

        {/* Vehicle info */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Vehicle</div>
            <div className="text-base font-bold text-neutral-900 mt-0.5">車両情報</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoRow label="メーカー" value={maker} />
            <InfoRow label="車種" value={model} />
            <InfoRow label="年式" value={year} />
            <InfoRow label="ナンバー" value={plate} />
            <InfoRow label="顧客名" value={customerName} />
            <InfoRow label="発行日" value={formatDate(data.certificate.created_at)} />
          </div>
        </section>

        {/* Certificate info */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Certificate</div>
            <div className="text-base font-bold text-neutral-900 mt-0.5">証明書情報</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoRow label="ステータス" value={getStatusLabel(data.certificate.status)} />
            <InfoRow label="有効期限タイプ" value={asText(data.certificate.expiry_type)} />
            <InfoRow
              label="有効期限値"
              value={data.certificate.expiry_value != null ? String(data.certificate.expiry_value) : ""}
            />
            <InfoRow
              label="バージョン"
              value={data.certificate.current_version != null ? String(data.certificate.current_version) : ""}
            />
          </div>

          {/* Free text */}
          {freeText ? (
            <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">
              {freeText}
            </div>
          ) : null}

          {/* Public URL */}
          <div className="mt-3 rounded-xl bg-neutral-50 p-3">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase mb-0.5">公開URL</div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-xs text-blue-600 underline"
            >
              {publicUrl}
            </a>
          </div>
        </section>

        {/* Images */}
        {images.length > 0 ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Images</div>
              <div className="text-base font-bold text-neutral-900 mt-0.5">添付画像</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {images.map((img) => (
                <a
                  key={String(img.id ?? img.sort_order ?? Math.random())}
                  href={String(img.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 hover:border-neutral-400 transition-colors"
                >
                  <img
                    src={String(img.url)}
                    alt={img.file_name || `image_${img.sort_order ?? ""}`}
                    className="h-36 w-full object-cover sm:h-48"
                  />
                  <div className="p-2 text-xs text-neutral-500 truncate">
                    {img.file_name || `image_${img.sort_order ?? "-"}`}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* History timeline */}
        {hasHistories ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">History</div>
              <div className="text-base font-bold text-neutral-900 mt-0.5">施工履歴</div>
            </div>
            <div className="relative pl-4">
              {/* Timeline line */}
              <div className="absolute left-0 top-2 bottom-2 w-px bg-neutral-200" />
              <div className="space-y-4">
                {data.histories?.map((row) => (
                  <div key={row.id} className="relative">
                    {/* Dot */}
                    <div className="absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-300 bg-white" />
                    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                      <div className="text-sm font-semibold text-neutral-900">{row.title}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        {formatDateTime(row.performed_at ?? row.created_at ?? null)}
                        {row.type ? ` · ${row.type}` : ""}
                      </div>
                      {row.description ? (
                        <div className="mt-2 text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap">
                          {row.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* NFC info — show only when tag exists */}
        {hasNfc ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">NFC</div>
              <div className="text-base font-bold text-neutral-900 mt-0.5">NFCタグ情報</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="状態" value={getNfcStatusLabel(data.nfc?.status)} />
              <InfoRow label="タグコード" value={data.nfc?.tag_code ?? ""} />
              <InfoRow label="書込日時" value={formatDateTime(data.nfc?.written_at)} />
              <InfoRow label="貼付日時" value={formatDateTime(data.nfc?.attached_at)} />
            </div>
          </section>
        ) : null}

        {/* PDF / actions */}
        {!isVoidCertificate ? (
          <CustomerActions
            pdfHref={pdfHref}
            returnTo={returnTo ?? undefined}
            logoutHref={logoutHref ?? undefined}
          />
        ) : null}

        {/* Shop contact info */}
        <ShopContact
          phone={data.contact_phone}
          email={data.contact_email}
          lineId={data.contact_line}
          note={data.contact_note}
        />

        {/* Inquiry form */}
        {!isVoidCertificate ? (
          <InquiryForm
            publicId={data.certificate.public_id!}
            shopName={data.shop?.name ?? undefined}
          />
        ) : null}

        {/* Footer */}
        <footer className="pt-2 text-center text-[11px] text-neutral-400">
          この証明書は CARTRUST により記録・管理されています
        </footer>
      </div>
    </main>
  );
}
