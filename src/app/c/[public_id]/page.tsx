import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CustomerActions from "./CustomerActions";

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
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.4 }}>CARTRUST CERT</div>
        <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>施工証明書</div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 999,
              background: certStatus === "active" ? "#ecfdf5" : certStatus === "void" ? "#fef2f2" : "#fff7ed",
              color: certStatus === "active" ? "#166534" : certStatus === "void" ? "#991b1b" : "#9a3412",
              fontWeight: 700,
              fontSize: 12,
              border: "1px solid #e5e7eb",
            }}
          >
            認証状態: {getStatusLabel(data.certificate.status)}
          </span>
          <span style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>
            Public ID: {data.certificate.public_id}
          </span>
        </div>
      </div>

      {certStatus !== "active" ? (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #fdba74",
            background: "#fff7ed",
            color: "#9a3412",
            borderRadius: 12,
            padding: 16,
          }}
        >
          この証明書は現在「{getStatusLabel(data.certificate.status)}」状態です。存在は確認できますが、一部機能や扱いが通常と異なる場合があります。
        </div>
      ) : null}

      {isVoidCertificate ? (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>この証明書は無効化されています</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            この公開ページでは記録の存在確認のみ可能です。PDF出力と添付画像の公開表示は停止しています。詳細確認は発行店舗へお問い合わせください。
          </div>
        </div>
      ) : null}

      {isPdfBlocked ? (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>現在、この証明書のPDFご案内を一時停止しています</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            このページの公開閲覧は引き続きご利用いただけますが、PDFのご案内は現在一時的に停止しています。
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>車両情報</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>メーカー: {maker || "-"}</div>
            <div>車種: {model || "-"}</div>
            <div>年式: {year || "-"}</div>
            <div>ナンバー: {plate || "-"}</div>
            <div>顧客名: {customerName || "-"}</div>
            <div>記録作成日: {formatDate(data.certificate.created_at)}</div>
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>証明書情報</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>施工店: {data.shop?.name || "-"}</div>
            <div>ステータス: {getStatusLabel(data.certificate.status)}</div>
            <div>有効期限タイプ: {asText(data.certificate.expiry_type) || "-"}</div>
            <div>有効期限値: {data.certificate.expiry_value != null ? String(data.certificate.expiry_value) : "-"}</div>
            <div>バージョン: {data.certificate.current_version != null ? String(data.certificate.current_version) : "-"}</div>
            <div>
              公開URL:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer">
                {publicUrl}
              </a>
            </div>
          </div>
          {freeText ? (
            <div style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {freeText}
            </div>
          ) : null}
        </section>

        {images.length > 0 ? (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>添付画像</div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {images.map((img) => (
                <a
                  key={String(img.id ?? img.sort_order ?? Math.random())}
                  href={String(img.url)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    textDecoration: "none",
                    color: "#111827",
                  }}
                >
                  <img
                    src={String(img.url)}
                    alt={img.file_name || `image_${img.sort_order ?? ""}`}
                    style={{
                      width: "100%",
                      height: 180,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                    }}
                  />
                  <div style={{ fontSize: 12, marginTop: 8, opacity: 0.75 }}>
                    {img.file_name || `image_${img.sort_order ?? "-"}`}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>NFC情報</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>状態: {getNfcStatusLabel(data.nfc?.status)}</div>
            <div>タグコード: {data.nfc?.tag_code || "-"}</div>
            <div>書込日時: {formatDateTime(data.nfc?.written_at)}</div>
            <div>貼付日時: {formatDateTime(data.nfc?.attached_at)}</div>
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>履歴</div>

          {(data.histories?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {data.histories?.map((row) => (
                <div key={row.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{row.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {formatDateTime(row.performed_at ?? row.created_at ?? null)} / {row.type}
                  </div>
                  {row.description ? (
                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                      {row.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 14, opacity: 0.75 }}>履歴はありません。</div>
          )}
        </section>
      </div>

      {!isVoidCertificate ? (
        <div style={{ marginTop: 16 }}>
          <CustomerActions
            pdfHref={pdfHref}
            returnTo={returnTo ?? undefined}
            logoutHref={logoutHref ?? undefined}
          />
        </div>
      ) : null}

      <footer style={{ marginTop: 20, fontSize: 12, opacity: 0.75 }}>
        この証明書は certificate.info により記録・管理されています
      </footer>
    </main>
  );
}