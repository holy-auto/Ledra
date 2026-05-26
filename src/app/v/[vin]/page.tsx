import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { getPassportData, getServiceTypeLabel } from "@/lib/passport/getPassportData";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { formatDate } from "@/lib/format";
import { findValidReportAccess, getVehicleReportSettings, reportCookieName } from "@/lib/vehicleReport/access";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import PurchaseReportCard from "./PurchaseReportCard";

type PageProps = {
  params: Promise<{ vin: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isPassportPublicEnabled()) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }
  const { vin } = await params;
  const data = await getPassportData(vin);
  if (!data) {
    return {
      title: "車両パスポート — Ledra",
      robots: { index: false, follow: false },
    };
  }
  const vehicleLabel = [data.display_maker, data.display_model, data.display_year].filter(Boolean).join(" ");
  const title = `${vehicleLabel || "車両パスポート"} — Ledra Vehicle Passport`;
  const description = `アンカー済み施工証明 ${data.anchored_cert_count}件 / 関与施工店 ${data.tenant_count}店。施工履歴は Polygon PoS ネットワーク上で改ざん検知可能。`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
    // Paywalled / transactional page — keep it out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function VehiclePassportPage({ params, searchParams }: PageProps) {
  if (!isPassportPublicEnabled()) notFound();
  const { vin } = await params;
  const data = await getPassportData(vin);
  if (!data) notFound();

  const vehicleLabel = [data.display_maker, data.display_model, data.display_year].filter(Boolean).join(" ");
  const passportId = data.vin_code_normalized.slice(-6);
  const firstSeen = new Date(data.first_seen_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long" });

  // Paywall: the trust summary (counts) stays free; the detailed
  // cross-tenant timeline is gated behind a one-time, account-less
  // payment. Access is granted via an httpOnly cookie set by the
  // Stripe success handler (/api/public/vehicle-report/unlock).
  const vinNorm = data.vin_code_normalized;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(reportCookieName(vinNorm))?.value ?? null;
  const access = await findValidReportAccess(vinNorm, accessToken);
  const isPaid = access !== null;

  // Logged-in Ledra member shops (any tenant member) can review the
  // cross-tenant "which shop did what" history for free — the paywall
  // only targets account-less third parties (e.g. 買取店).
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  const isMemberFree = caller !== null;

  const isUnlocked = isPaid || isMemberFree;

  const sp = (await searchParams) ?? {};
  const rawNotice = Array.isArray(sp.canceled)
    ? "canceled"
    : sp.canceled
      ? "canceled"
      : Array.isArray(sp.pending)
        ? "pending"
        : sp.pending
          ? "pending"
          : null;
  const notice = rawNotice as "canceled" | "pending" | null;
  const sourcePublicId = typeof sp.src === "string" ? sp.src : Array.isArray(sp.src) ? sp.src[0] : undefined;

  const settings = isUnlocked ? null : await getVehicleReportSettings();

  return (
    <main className="mx-auto max-w-[860px] p-4">
      {/* Header */}
      <div className="glass-card mb-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[22px] font-extrabold tracking-wide text-primary">
              {vehicleLabel || "車両パスポート"}
            </div>
            <div className="mt-1 font-mono text-sm text-muted">VIN: {data.vin_code_normalized}</div>
          </div>
          <div className="rounded-xl border border-border-default bg-surface px-3 py-2 text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-muted">Passport ID</div>
            <div className="font-mono text-sm font-bold text-primary">{passportId}</div>
          </div>
        </div>

        {/* Summary badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-[rgba(16,185,129,0.1)] px-3 py-1.5 text-xs font-semibold text-emerald-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            アンカー済み施工証明 {data.anchored_cert_count}件
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-[rgba(59,130,246,0.1)] px-3 py-1.5 text-xs font-semibold text-blue-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.585a3.001 3.001 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z"
              />
            </svg>
            関与施工店 {data.tenant_count}店
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1.5 text-xs text-muted">
            初回登録 {firstSeen}
          </span>
          {isMemberFree && !isPaid ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-[rgba(16,185,129,0.1)] px-3 py-1.5 text-xs font-semibold text-emerald-400">
              加盟店ログイン中 — 全履歴を無料表示
            </span>
          ) : null}
        </div>

        {/* Meta-anchor: one tx that summarizes the entire history of this VIN. */}
        {data.meta_anchor ? (
          <div className="mt-4 rounded-xl border border-violet-500/30 bg-[rgba(139,92,246,0.07)] p-3 text-sm">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-violet-400">
                  履歴の集約証明 — 全 {data.meta_anchor.cert_count ?? data.anchored_cert_count} 件の施工記録を 1 Tx
                  に集約
                </div>
                <div className="mt-1 break-all font-mono text-[10px] text-muted">{data.meta_anchor.hash}</div>
                {data.meta_anchor.explorer_url ? (
                  <a
                    href={data.meta_anchor.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                  >
                    Polygonscan で集約Txを見る ({data.meta_anchor.network})
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Certificate timeline — gated behind the paid report */}
      {isUnlocked ? (
        <div className="glass-card mb-4 p-5">
          <div className="mb-4 font-bold text-primary">施工履歴（ブロックチェーン認証済み）</div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border-default" />

            <div className="flex flex-col gap-5">
              {data.certificates.map((cert) => (
                <div key={cert.public_id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-emerald-500 bg-[rgba(16,185,129,0.2)]" />

                  <div className="flex-1 rounded-xl border border-border-default bg-base p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-primary">{getServiceTypeLabel(cert.service_type)}</div>
                        <div className="mt-0.5 text-sm text-secondary">
                          {cert.shop_name ?? "施工店名不明"} · {formatDate(cert.created_at)}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-[rgba(16,185,129,0.08)] px-2 py-0.5 text-xs text-emerald-400">
                        画像 {cert.anchored_image_count}枚 アンカー済み
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {cert.primary_explorer_url ? (
                        <a
                          href={cert.primary_explorer_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface px-2.5 py-1 text-xs text-accent hover:border-accent/50 no-underline transition-colors"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                            />
                          </svg>
                          Polygon Tx
                          {cert.primary_tx_network === "amoy" && <span className="text-muted">(testnet)</span>}
                        </a>
                      ) : null}
                      <Link
                        href={`/c/${cert.public_id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface px-2.5 py-1 text-xs text-secondary hover:border-accent/50 hover:text-primary no-underline transition-colors"
                      >
                        証明書を見る →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <PurchaseReportCard
          vin={vinNorm}
          priceJpy={settings?.price_jpy ?? 0}
          enabled={settings?.enabled ?? false}
          notice={notice}
          sourcePublicId={sourcePublicId}
        />
      )}

      <footer className="text-xs text-muted">
        このパスポートに記載された施工証明の真正性は Polygon PoS ネットワーク上で検証可能です。 各施工写真の SHA-256
        ハッシュがブロックチェーンに記録されており、改ざんを検知できます。
      </footer>
    </main>
  );
}
