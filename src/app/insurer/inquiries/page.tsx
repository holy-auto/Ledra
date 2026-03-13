"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Inquiry = {
  id: string;
  tenant_id: string;
  tenant_name?: string | null;
  public_id?: string | null;
  sender_name: string;
  sender_email?: string | null;
  body: string;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未対応",
  replied: "対応済",
  closed: "完了",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  replied: "bg-blue-50 text-blue-700 ring-blue-200",
  closed: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};

function formatDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

export default function InsurerInquiriesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/insurer/inquiries?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setInquiries(j.inquiries ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/insurer/login";
  };

  if (!ready) return null;

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
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">お問い合わせ一覧</h1>
              <p className="mt-2 text-sm text-neutral-600">
                全店舗のお客様からのお問い合わせを確認します
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <a
              href="/insurer"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              証明書検索
            </a>
            <button
              onClick={onLogout}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ログアウト
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="送信者名・内容・証明書IDで検索"
              className="flex-1 min-w-[200px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">全ステータス</option>
              <option value="pending">未対応</option>
              <option value="replied">対応済</option>
              <option value="closed">完了</option>
            </select>
            <button
              type="button"
              onClick={runSearch}
              disabled={loading}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? "検索中..." : "検索"}
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center text-sm text-neutral-400 py-8">読み込み中...</div>
        ) : inquiries.length === 0 ? (
          <div className="text-center text-sm text-neutral-400 py-8">お問い合わせはありません</div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">店舗</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">送信者</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">内容</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">証明書ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">ステータス</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">日時</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inq) => (
                  <tr
                    key={inq.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 ${
                      inq.status === "pending" ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {inq.tenant_name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{inq.sender_name}</div>
                      {inq.sender_email && (
                        <div className="text-xs text-neutral-400">{inq.sender_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
                        className="text-left"
                      >
                        {expandedId === inq.id ? (
                          <div className="whitespace-pre-wrap text-neutral-700">{inq.body}</div>
                        ) : (
                          <div className="line-clamp-2 text-neutral-700">{inq.body}</div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-neutral-500">{inq.public_id ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          STATUS_BADGE_CLASS[inq.status] ?? STATUS_BADGE_CLASS.closed
                        }`}
                      >
                        {STATUS_LABELS[inq.status] ?? inq.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                      {formatDateTime(inq.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
