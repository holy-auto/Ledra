import { notFound } from "next/navigation";
import { headers } from "next/headers";
import CustomerActions from "./CustomerActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ public_id: string }>;
};

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
};

async function fetchCertificatePublic(publicId: string): Promise<CertPublic | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const q = new URL(`${url}/rest/v1/certificates_public`);
  q.searchParams.set("select", "*");
  q.searchParams.set("public_id", `eq.${publicId}`);
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

async function getRequestOrigin(): Promise<string> {
  const h = await headers(); // Next.js 16: Promise
  const xfProto = h.get("x-forwarded-proto");
  const xfHost = h.get("x-forwarded-host");
  const host = xfHost ?? h.get("host") ?? "localhost:3000";
  const proto = xfProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function buildOriginFromCert(cert: { tenant_custom_domain?: string | null }, fallbackOrigin: string) {
  if (cert.tenant_custom_domain) return `https://${cert.tenant_custom_domain}`;
  if (process.env.APP_URL) return process.env.APP_URL;
  return fallbackOrigin;
}

export default async function CertificatePublicPage({ params, searchParams }: PageProps) {
  const { public_id } = await params;
  const publicId = public_id;

  if (!/^[a-f0-9]{32}$/i.test(publicId)) notFound();

  const cert = await fetchCertificatePublic(publicId);
  if (!cert) notFound();
  if ((cert.status ?? "").toLowerCase() !== "active") notFound();

  const fallbackOrigin = await getRequestOrigin();
  const origin = buildOriginFromCert(cert, fallbackOrigin);
  const publicUrl = `${origin}/c/${cert.public_id}`;

  // 依存ゼロ：外部QR画像（スマホOK）
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(publicUrl)}`;

  const pdfHref = `/api/certificate/pdf?pid=${cert.public_id}`;

  const sp = await searchParams;
  const rtRaw = sp?.rt;
  const returnTo =
    typeof rtRaw === "string" ? rtRaw :
    Array.isArray(rtRaw) ? rtRaw[0] : null;

  const logoutFlag = sp?.logout;
  const showLogout =
    logoutFlag === "1" || logoutFlag === "true" ||
    (Array.isArray(logoutFlag) && (logoutFlag[0] === "1" || logoutFlag[0] === "true"));

  // 暫定：customer-login 実装前なので /login に飛ばす
  const logoutHref = showLogout ? "/login" : null;

  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>施工証明書（公開）</div>
          <h1 style={{ fontSize: 24, margin: "6px 0 0" }}>{cert.tenant_name ?? "施工店"}</h1>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Public ID: {cert.public_id}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, opacity: 0.8 }}>
          <div>発行日</div>
          <div style={{ fontSize: 14, opacity: 1 }}>{cert.created_at ? new Date(cert.created_at).toLocaleString("ja-JP") : "-"}</div>
        </div>
      </header>

      <CustomerActions pdfHref={pdfHref} returnTo={returnTo} logoutHref={logoutHref} />
<section style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ width: 220, height: 220, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff", display: "grid", placeItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR" width={220} height={220} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>QR / 公開URL</h2>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>スマホで読み取り or URLを共有</div>
          <a href={publicUrl} style={{ wordBreak: "break-all" }}>{publicUrl}</a>
          <div style={{ marginTop: 10 }}>
            <a href={pdfHref} target="_blank" rel="noreferrer">PDFを表示</a>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>お客様</h2>
        <div style={{ fontSize: 18 }}>{cert.customer_name ?? "-"}</div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>施工内容</h2>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{cert.content_free_text ?? "-"}</div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>有効期限 / メンテ条件</h2>
        <div style={{ lineHeight: 1.6 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>type: {cert.expiry_type ?? "-"}</div>
          <div style={{ fontSize: 16 }}>{cert.expiry_value ?? "-"}</div>
        </div>
      </section>

      <footer style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 12, opacity: 0.8 }}>
        {cert.footer_variant === "holy" ? (
          <div>本施工証明書は HOLY 監修フォーマットです。</div>
        ) : (
          <div>本施工証明書は施工店発行の公開証明です。</div>
        )}
      </footer>
    </main>
  );
}