"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Shop = {
  tenant_slug: string;
  shop_name: string;
  display_name: string;
  certificate_count: number;
  reservation_count: number;
  next_reservation_at: string | null;
  line_linked: boolean;
  last_activity_at: string | null;
  is_recent?: boolean;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ja-JP");
}

export default function PortalShopListPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const tenant = useMemo(() => (sp.get("tenant") ?? "").trim(), [sp]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : "";
        const res = await fetch(`/api/portal/memberships${q}`, { credentials: "include", cache: "no-store" });
        const j = await res.json();
        if (res.status === 401) {
          router.replace(tenant ? `/my?tenant=${encodeURIComponent(tenant)}` : "/my");
          return;
        }
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? "load failed");
        if (active) setShops(j.shops ?? []);
      } catch (e: any) {
        if (active) setErr(e?.message ?? "一覧の取得に失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router, tenant]);

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/my");
  }

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <div className="mb-6">
        <div className="text-sm font-semibold text-blue-600">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">ご利用中の加盟店</h1>
        <p className="mt-2 text-sm text-neutral-600">
          ログイン後に、確認したい加盟店を選択してください。あとからいつでも切り替えられます。
        </p>
      </div>

      {loading ? <div className="text-sm text-neutral-500">読み込み中…</div> : null}
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {shops.map((shop) => (
          <div key={shop.tenant_slug} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-900">{shop.shop_name}</div>
                <div className="mt-1 text-sm text-neutral-500">{shop.display_name} 様</div>
              </div>
              {shop.is_recent ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  最近見た加盟店
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2 text-sm text-neutral-700">
              <div>施工証明書 {shop.certificate_count}件</div>
              <div>予約 {shop.reservation_count}件</div>
              <div>{shop.next_reservation_at ? `次回予約 ${formatDate(shop.next_reservation_at)}` : "予約なし"}</div>
              <div>{shop.line_linked ? "LINE連携済み" : "LINE未連携"}</div>
            </div>

            <button
              onClick={() => router.push(`/customer/${encodeURIComponent(shop.tenant_slug)}?from=portal`)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              この加盟店を見る
            </button>
          </div>
        ))}
      </div>

      {!loading && !err && shops.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-600">
          ご利用中の加盟店が見つかりませんでした。登録情報をご確認ください。
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button
          onClick={logout}
          className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          ログアウト
        </button>
      </div>
    </main>
  );
}
