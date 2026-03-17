"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CertificateStatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  vehicle_model: string;
  vehicle_plate: string;
  created_at: string;
  tenant_id: string;
};

export default function InsurerHomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [planTier, setPlanTier] = useState<string>("");
  const [insurerStatus, setInsurerStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
      // Fetch billing state
      try {
        const res = await fetch("/api/insurer/billing");
        if (res.ok) {
          const j = await res.json();
          if (j.plan_tier) setPlanTier(j.plan_tier);
        }
      } catch {}

      // ステータス取得
      try {
        const { data: statusData } = await supabase.rpc("get_my_insurer_status");
        const row = Array.isArray(statusData) ? statusData[0] : statusData;
        if (row?.status) setInsurerStatus(row.status);
      } catch {
        // RPC未定義の場合は無視（既存環境互換）
      }
    })();
  }, [supabase]);

  const runSearch = async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ limit: "50", offset: "0" });
      if (q) qs.set("q", q);
      if (status) qs.set("status", status);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const res = await fetch(`/api/insurer/search?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "search_failed");
      setRows(j?.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "search_failed");
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/insurer/login";
  };

  const startCheckout = async () => {
    setBillingBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_tier: "pro" }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      if (j?.checkout_url) {
        window.location.href = j.checkout_url;
      } else if (j?.portal_url) {
        window.location.href = j.portal_url;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBillingBusy(false);
    }
  };

  if (!ready) return null;

  const isPending = insurerStatus === "active_pending_review";
  const isSuspended = insurerStatus === "suspended";

  if (isSuspended) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-xl font-bold text-red-800 mb-2">アカウント停止中</h1>
          <p className="text-sm text-red-700 mb-4">
            このアカウントは現在停止されています。詳細は管理者にお問い合わせください。
          </p>
          <button onClick={onLogout} className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            ログアウト
          </button>
        </div>
      </main>
    );
  }

  const exportQs = new URLSearchParams();
  if (q) exportQs.set("q", q);
  if (status) exportQs.set("status", status);
  if (dateFrom) exportQs.set("date_from", dateFrom);
  if (dateTo) exportQs.set("date_to", dateTo);
  const exportUrl = `/api/insurer/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              INSURER PORTAL
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                証明書検索
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                保険会社ポータル — 施工証明書を public_id・顧客名・車両で検索します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={startCheckout}
              disabled={billingBusy || isPending}
              title={isPending ? "仮登録中はご利用いただけません" : undefined}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              {billingBusy ? "処理中..." : planTier ? `プラン管理 (${planTier})` : "サブスク契約"}
            </button>
            <button
              onClick={onLogout}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ログアウト
            </button>
          </div>
        </header>

        {/* 仮開通バナー */}
        {isPending && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold">!</div>
              <div>
                <div className="text-sm font-semibold text-amber-800">仮登録中</div>
                <p className="mt-1 text-sm text-amber-700">
                  現在アカウントは審査待ちの仮登録状態です。証明書の検索・閲覧はご利用いただけますが、
                  CSV出力・PDF出力・ユーザー招待・サブスク契約は正式開通後にご利用いただけます。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">SEARCH</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">証明書を検索</div>
          </div>
          <div className="space-y-3">
            {/* キーワード行 */}
            <div className="flex gap-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="public_id / 顧客名 / 車両型式 / ナンバー"
                className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
              <button
                onClick={runSearch}
                disabled={busy}
                className="btn-primary disabled:opacity-50"
              >
                {busy ? "検索中..." : "検索"}
              </button>
              {isPending ? (
                <span
                  title="仮登録中はご利用いただけません"
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-400 cursor-not-allowed"
                >
                  CSV
                </span>
              ) : (
                <a
                  href={exportUrl}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  CSV
                </a>
              )}
            </div>

            {/* フィルタ行 */}
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="">全ステータス</option>
                <option value="active">有効 (active)</option>
                <option value="void">無効 (void)</option>
              </select>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-500 whitespace-nowrap">FROM</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-500 whitespace-nowrap">TO</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                />
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}
        </div>

        {/* Results */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">RESULTS</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">検索結果</div>
            </div>
            {rows.length > 0 && (
              <div className="text-sm text-neutral-500">
                <span className="font-semibold text-neutral-900">{rows.length}</span> 件
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left font-semibold text-neutral-600">証明書 ID</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">顧客名</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">車両</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">ステータス</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">作成日時</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.public_id} className="border-t hover:bg-neutral-50">
                    <td className="p-3 font-mono text-xs text-neutral-700">{r.public_id}</td>
                    <td className="p-3 font-medium text-neutral-900">{r.customer_name}</td>
                    <td className="p-3 text-neutral-600">
                      {[r.vehicle_model, r.vehicle_plate].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="p-3">
                      <CertificateStatusBadge status={r.status} />
                    </td>
                    <td className="p-3 whitespace-nowrap text-neutral-600">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="p-3">
                      <a
                        href={`/insurer/c/${encodeURIComponent(r.public_id)}`}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        詳細
                      </a>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-neutral-500">
                      {q ? `「${q}」に一致する証明書が見つかりません。` : "検索キーワードを入力してください。"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  );
}
