import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CustomerActions from "./CustomerActions";
import { logCertificateAction } from "@/lib/audit/certificateLog";
import { formatDate, formatDateTime } from "@/lib/format";
import { getPanelLabel, getCoverageLabel, getFilmTypeLabel } from "@/lib/ppf/constants";
import { getWorkTypeLabel } from "@/lib/maintenance/constants";
import {
  getRepairTypeLabel,
  getRepairPanelLabel,
  getPaintTypeLabel,
  getRepairMethodLabel,
} from "@/lib/bodyRepair/constants";

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
    /* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
    vehicle_info_json?: Record<string, any>;
    content_free_text?: string | null;
    content_preset_json?: Record<string, any>;
    expiry_type?: string | null;
    expiry_value?: string | null;
    logo_asset_path?: string | null;
    footer_variant?: string | null;
    current_version?: string | null;
    service_type?: string | null;
    ppf_coverage_json?: Record<string, any>[] | null;
    coating_products_json?: Record<string, any>[] | null;
    warranty_period_end?: string | null;
    warranty_exclusions?: string | null;
    maintenance_json?: Record<string, any> | null;
    body_repair_json?: Record<string, any> | null;
    /* eslint-enable @typescript-eslint/no-explicit-any */
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

function pickVehicleField(vehicle: Record<string, any> | null | undefined, info: Record<string, any>, keys: string[]) {
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
  const res = await fetch(`${origin}/api/certificate/public-status?pid=${encodeURIComponent(publicId)}`, {
    cache: "no-store",
  });

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
  const logoutHref = typeof sp?.logout === "string" && sp.logout !== "1" ? sp.logout : undefined;
  const tenantSlug = asText(data.shop?.slug);
  const entry = typeof sp?.entry === "string" ? sp.entry : undefined;
  const from = typeof sp?.from === "string" ? sp.from : undefined;
  const openedFromNfc = entry === "nfc" || from === "nfc";
  const portalFrom = openedFromNfc ? "nfc" : from === "portal" ? "portal" : "certificate";
  const portalParams = new URLSearchParams();
  if (tenantSlug) portalParams.set("tenant", tenantSlug);
  portalParams.set("pid", data.certificate.public_id);
  portalParams.set("from", portalFrom);
  const portalHref = `/my?${portalParams.toString()}`;

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
        <div className="text-[28px] font-extrabold tracking-wide text-primary">Ledra</div>
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
          <span className="self-center text-xs text-secondary">Public ID: {data.certificate.public_id}</span>
        </div>
      </div>

      {certStatus !== "active" ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-4 text-amber-400">
          この証明書は現在「{getStatusLabel(data.certificate.status)}
          」状態です。存在は確認できますが、一部機能や扱いが通常と異なる場合があります。
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
        {tenantSlug ? (
          <section className="glass-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-primary">Ledra マイページ</div>
                <div className="mt-1 text-sm leading-6 text-secondary">
                  {openedFromNfc
                    ? "NFCタグから開いた証明書です。マイページに進むと、この店舗の他の証明書や予約もまとめて確認できます。"
                    : "この店舗のマイページに進むと、関連する証明書や予約をまとめて確認できます。"}
                </div>
              </div>
              <a
                href={portalHref}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-blue-700"
              >
                マイページへ進む
              </a>
            </div>
          </section>
        ) : null}
        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">車両情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              メーカー: <span className="text-primary">{maker || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              車種: <span className="text-primary">{model || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              年式: <span className="text-primary">{year || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              ナンバー: <span className="text-primary">{plate || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              顧客名: <span className="text-primary">{customerName || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              記録作成日: <span className="text-primary">{formatDate(data.certificate.created_at)}</span>
            </div>
          </div>
        </section>

        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">証明書情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              施工店: <span className="text-primary">{data.shop?.name || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              ステータス: <span className="text-primary">{getStatusLabel(data.certificate.status)}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              有効期限タイプ: <span className="text-primary">{asText(data.certificate.expiry_type) || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              有効期限値:{" "}
              <span className="text-primary">
                {data.certificate.expiry_value != null ? String(data.certificate.expiry_value) : "-"}
              </span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              バージョン:{" "}
              <span className="text-primary">
                {data.certificate.current_version != null ? String(data.certificate.current_version) : "-"}
              </span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary sm:col-span-2 lg:col-span-3 min-w-0">
              公開URL:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
                {publicUrl}
              </a>
            </div>
          </div>
          {freeText ? <div className="mt-3 whitespace-pre-wrap leading-relaxed text-secondary">{freeText}</div> : null}
        </section>

        {/* PPF施工範囲 */}
        {data.certificate.service_type === "ppf" &&
        Array.isArray(data.certificate.ppf_coverage_json) &&
        data.certificate.ppf_coverage_json.length > 0 ? (
          <section className="glass-card p-4">
            <div className="mb-3 font-bold text-primary">PPF施工範囲</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.certificate.ppf_coverage_json.map((entry: Record<string, any>, idx: number) => (
                <div key={idx} className="rounded-lg bg-base px-3 py-2 text-secondary">
                  {getPanelLabel(entry.panel)}:{" "}
                  <span className={`font-medium ${entry.coverage === "full" ? "text-emerald-400" : "text-amber-400"}`}>
                    {getCoverageLabel(entry.coverage)}
                  </span>
                  {entry.partial_note ? <span className="ml-1 text-xs text-muted">({entry.partial_note})</span> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 使用フィルム / コーティング剤 */}
        {Array.isArray(data.certificate.coating_products_json) && data.certificate.coating_products_json.length > 0 ? (
          <section className="glass-card p-4">
            <div className="mb-3 font-bold text-primary">
              {data.certificate.service_type === "ppf" ? "使用フィルム" : "使用製品"}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.certificate.coating_products_json.map((cp: Record<string, any>, idx: number) => (
                <div key={idx} className="rounded-lg bg-base px-3 py-2 text-secondary">
                  <span className="text-primary font-medium">
                    {[cp.brand_name, cp.product_name].filter(Boolean).join(" / ") || "-"}
                  </span>
                  {cp.film_type ? (
                    <span className="ml-2 text-xs text-muted">({getFilmTypeLabel(cp.film_type)})</span>
                  ) : null}
                  {cp.location ? <div className="text-xs text-muted mt-0.5">{cp.location}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 整備内容 */}
        {data.certificate.service_type === "maintenance" &&
        data.certificate.maintenance_json &&
        typeof data.certificate.maintenance_json === "object" &&
        Object.keys(data.certificate.maintenance_json).length > 0
          ? (() => {
              const m = data.certificate.maintenance_json;
              return (
                <section className="glass-card p-4">
                  <div className="mb-3 font-bold text-primary">整備内容</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.isArray(m.work_types) && m.work_types.length > 0 ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary sm:col-span-2 lg:col-span-3">
                        作業種別:{" "}
                        <span className="text-primary font-medium">
                          {m.work_types.map((wt: string) => getWorkTypeLabel(wt)).join("、")}
                        </span>
                      </div>
                    ) : null}
                    {m.mileage ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        走行距離: <span className="text-primary">{m.mileage} km</span>
                      </div>
                    ) : null}
                    {m.mechanic_name ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        担当整備士: <span className="text-primary">{m.mechanic_name}</span>
                      </div>
                    ) : null}
                    {m.next_service_date ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        次回点検日: <span className="text-primary">{m.next_service_date}</span>
                      </div>
                    ) : null}
                  </div>
                  {m.parts_replaced ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">交換部品</div>
                      <div className="whitespace-pre-wrap">{m.parts_replaced}</div>
                    </div>
                  ) : null}
                  {m.findings ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">点検結果・所見</div>
                      <div className="whitespace-pre-wrap">{m.findings}</div>
                    </div>
                  ) : null}
                </section>
              );
            })()
          : null}

        {/* 鈑金塗装内容 */}
        {data.certificate.service_type === "body_repair" &&
        data.certificate.body_repair_json &&
        typeof data.certificate.body_repair_json === "object" &&
        Object.keys(data.certificate.body_repair_json).length > 0
          ? (() => {
              const br = data.certificate.body_repair_json;
              return (
                <section className="glass-card p-4">
                  <div className="mb-3 font-bold text-primary">鈑金塗装内容</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {br.repair_type ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        修理種別: <span className="text-primary font-medium">{getRepairTypeLabel(br.repair_type)}</span>
                      </div>
                    ) : null}
                    {br.paint_color_code ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        塗装色: <span className="text-primary">{br.paint_color_code}</span>
                      </div>
                    ) : null}
                    {br.paint_type ? (
                      <div className="rounded-lg bg-base px-3 py-2 text-secondary">
                        塗装タイプ: <span className="text-primary">{getPaintTypeLabel(br.paint_type)}</span>
                      </div>
                    ) : null}
                  </div>
                  {Array.isArray(br.affected_panels) && br.affected_panels.length > 0 ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">修理箇所</div>
                      <div className="flex flex-wrap gap-1.5">
                        {br.affected_panels.map((p: string, idx: number) => (
                          <span
                            key={idx}
                            className="rounded-md bg-surface px-2 py-0.5 text-xs text-primary border border-border-default"
                          >
                            {getRepairPanelLabel(p)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {Array.isArray(br.repair_methods) && br.repair_methods.length > 0 ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">修理方法</div>
                      <div className="flex flex-wrap gap-1.5">
                        {br.repair_methods.map((m: string, idx: number) => (
                          <span
                            key={idx}
                            className="rounded-md bg-surface px-2 py-0.5 text-xs text-primary border border-border-default"
                          >
                            {getRepairMethodLabel(m)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {br.before_notes ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">修理前の状態</div>
                      <div className="whitespace-pre-wrap">{br.before_notes}</div>
                    </div>
                  ) : null}
                  {br.after_notes ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">修理後の状態</div>
                      <div className="whitespace-pre-wrap">{br.after_notes}</div>
                    </div>
                  ) : null}
                  {br.warranty_info ? (
                    <div className="mt-2 rounded-lg bg-base px-3 py-2 text-secondary">
                      <div className="font-medium text-primary mb-1">修理保証</div>
                      <div className="whitespace-pre-wrap">{br.warranty_info}</div>
                    </div>
                  ) : null}
                </section>
              );
            })()
          : null}

        {images.length > 0 ? (
          <section className="glass-card p-4">
            <div className="mb-3 font-bold text-primary">添付画像</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <a
                  key={String(img.id ?? `${img.sort_order ?? 0}-${img.url ?? img.file_name ?? "image"}`)}
                  href={String(img.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-border-default p-2.5 no-underline transition-colors hover:border-accent/50 hover:bg-surface-hover"
                >
                  <img
                    src={String(img.url)}
                    alt={img.file_name || `image_${img.sort_order ?? ""}`}
                    className="h-[180px] w-full rounded-lg border border-border-default bg-base object-cover"
                  />
                  <div className="mt-2 text-xs text-muted">{img.file_name || `image_${img.sort_order ?? "-"}`}</div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="glass-card p-4">
          <div className="mb-3 font-bold text-primary">NFC情報</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              状態: <span className="text-primary">{getNfcStatusLabel(data.nfc?.status)}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              タグコード: <span className="text-primary">{data.nfc?.tag_code || "-"}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              書込日時: <span className="text-primary">{formatDateTime(data.nfc?.written_at)}</span>
            </div>
            <div className="rounded-lg bg-base px-3 py-2 text-secondary">
              貼付日時: <span className="text-primary">{formatDateTime(data.nfc?.attached_at)}</span>
            </div>
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
                    <div className="mt-2 whitespace-pre-wrap leading-relaxed text-secondary">{row.description}</div>
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
            publicId={data.certificate.public_id}
            tenant={tenantSlug || undefined}
            pdfHref={pdfHref}
            returnTo={returnTo ?? undefined}
            logoutHref={logoutHref ?? undefined}
            portalHref={portalHref}
          />
        </div>
      ) : null}

      <footer className="mt-5 text-xs text-muted">この証明書は certificate.info により記録・管理されています</footer>
    </main>
  );
}
