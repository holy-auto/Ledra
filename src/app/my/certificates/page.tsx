"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Vehicle = {
  maker: string | null;
  model: string | null;
  plate_display: string | null;
};

type Certificate = {
  id: string;
  public_id: string;
  created_at: string;
  vehicle: Vehicle | null;
  download_url: string;
};

function formatDate(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ja-JP");
}

function vehicleLabel(v: Vehicle | null): string | null {
  if (!v) return null;
  const parts = [v.maker, v.model].filter(Boolean).join(" ");
  const plate = v.plate_display ? `（${v.plate_display}）` : "";
  const label = `${parts}${plate}`.trim();
  return label || null;
}

function PortalCertificatesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tenant = useMemo(() => (sp.get("tenant") ?? "").trim(), [sp]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!tenant) {
        setErr("加盟店が指定されていません。");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/portal/certificates?tenant=${encodeURIComponent(tenant)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/my?tenant=${encodeURIComponent(tenant)}`);
          return;
        }
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? "load failed");
        if (active) setCertificates(Array.isArray(j.certificates) ? j.certificates : []);
      } catch (e: unknown) {
        if (active) setErr(e instanceof Error ? e.message : "証明書の取得に失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router, tenant]);

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <div className="mb-6">
        <Link href="/my/shops" className="text-sm text-accent hover:underline">
          ← 店舗一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">証明書ダウンロード</h1>
        <p className="mt-2 text-sm text-secondary">発行された施工証明書をご確認・ダウンロードいただけます。</p>
      </div>

      {loading ? <div className="text-sm text-muted">読み込み中…</div> : null}
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">
          {err}
        </div>
      ) : null}

      <div className="space-y-4">
        {certificates.map((cert) => {
          const veh = vehicleLabel(cert.vehicle);
          return (
            <div key={cert.public_id} className="rounded-3xl border border-border-default bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-primary">施工証明書</div>
                  {veh ? <div className="mt-1 text-sm text-muted">{veh}</div> : null}
                  <div className="mt-1 text-sm text-secondary">発行日 {formatDate(cert.created_at)}</div>
                </div>
                <Link
                  href={cert.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
                >
                  証明書を見る
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && !err && certificates.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface px-4 py-4 text-sm text-secondary">
          発行済みの施工証明書はありません。
        </div>
      ) : null}
    </main>
  );
}

export default function PortalCertificatesPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl p-6 text-sm text-muted">読み込み中…</main>}>
      <PortalCertificatesInner />
    </Suspense>
  );
}
