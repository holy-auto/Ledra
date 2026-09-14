"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type StoreRow = {
  store_id: string;
  store_name: string;
  store_address: string;
  store_phone: string;
  store_email: string;
  store_manager: string;
  tenant_id: string;
  tenant_name: string;
};

export default function InsurerStoresPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    })();
  }, [supabase]);

  const runSearch = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    setSearched(true);
    try {
      const qs = new URLSearchParams({
        q: q.trim(),
        limit: "50",
      });
      const res = await fetch(`/api/insurer/stores?${qs.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "search_failed");
      setRows(j?.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "search_failed");
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
          STORE SEARCH
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">店舗検索</h1>
          <p className="mt-2 text-sm text-secondary">
            店舗名・住所・電話番号で店舗を検索し、問い合わせを作成できます。
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
        <div className="flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="店舗名 / 住所 / 電話番号"
            className="flex-1 rounded-xl border border-border-default bg-inset px-4 py-2.5 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
          <button onClick={runSearch} disabled={busy || !q.trim()} className="btn-primary disabled:opacity-50">
            {busy ? "検索中..." : "検索"}
          </button>
        </div>
        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </section>

      <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">RESULTS</div>
            <div className="mt-1 text-base font-semibold text-primary">検索結果</div>
          </div>
          {rows.length > 0 && (
            <div className="text-sm text-muted">
              <span className="font-semibold text-primary">{rows.length}</span> 件
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="min-w-full text-sm">
            <thead className="bg-inset">
              <tr>
                <th className="p-3 text-left font-semibold text-secondary">店舗名</th>
                <th className="p-3 text-left font-semibold text-secondary">住所</th>
                <th className="p-3 text-left font-semibold text-secondary">電話</th>
                <th className="p-3 text-left font-semibold text-secondary">担当者</th>
                <th className="p-3 text-left font-semibold text-secondary">テナント名</th>
                <th className="p-3 text-left font-semibold text-secondary">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.store_id} className="border-t hover:bg-inset">
                  <td className="p-3 font-medium text-primary">{r.store_name || "-"}</td>
                  <td className="p-3 text-secondary">{r.store_address || "-"}</td>
                  <td className="p-3 text-secondary">{r.store_phone || "-"}</td>
                  <td className="p-3 text-secondary">{r.store_manager || "-"}</td>
                  <td className="p-3 text-secondary">{r.tenant_name || "-"}</td>
                  <td className="p-3">
                    <Link
                      href={`/insurer/cases?create=true&tenant_id=${r.tenant_id}&store_name=${encodeURIComponent(r.store_name)}`}
                      className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover"
                    >
                      問い合わせ
                    </Link>
                  </td>
                </tr>
              ))}
              {searched && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted">
                    該当する店舗が見つかりません。
                  </td>
                </tr>
              )}
              {!searched && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted">
                    検索キーワードを入力してください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
