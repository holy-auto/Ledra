"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

/* ── status / priority maps ── */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "対応待ち", color: "blue" },
  in_progress: { label: "対応中", color: "amber" },
  pending_tenant: { label: "施工店確認中", color: "purple" },
  resolved: { label: "解決済み", color: "emerald" },
  closed: { label: "クローズ", color: "neutral" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "低", color: "neutral" },
  normal: { label: "通常", color: "blue" },
  high: { label: "高", color: "amber" },
  urgent: { label: "緊急", color: "red" },
};

const FILTER_TABS = [
  { key: "", label: "全て" },
  { key: "in_progress", label: "対応中" },
  { key: "pending_tenant", label: "施工店確認中" },
  { key: "resolved", label: "解決済み" },
  { key: "closed", label: "クローズ" },
] as const;

/* ── badge color helpers ── */

function statusClasses(status: string) {
  const c = STATUS_MAP[status]?.color ?? "neutral";
  const map: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    purple: "bg-purple-100 text-purple-800",
    emerald: "bg-emerald-100 text-emerald-800",
    neutral: "bg-neutral-100 text-neutral-600",
  };
  return map[c] ?? map.neutral;
}

function priorityClasses(priority: string) {
  const c = PRIORITY_MAP[priority]?.color ?? "neutral";
  const map: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return map[c] ?? map.neutral;
}

/* ── types ── */

type CaseRow = {
  id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
};

/* ── component ── */

export default function InsurerCasesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Advanced filter state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  // create-form state
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formCategory, setFormCategory] = useState("");
  const [formCertId, setFormCertId] = useState("");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* auth check */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  /* fetch cases */
  const fetchCases = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterCategory) params.set("category", filterCategory);
      if (filterDateFrom) params.set("date_from", filterDateFrom);
      if (filterDateTo) params.set("date_to", filterDateTo);
      if (filterQuery) params.set("q", filterQuery);

      const qs = params.toString();
      const url = qs ? `/api/insurer/cases?${qs}` : "/api/insurer/cases";
      const res = await fetch(url);
      if (!res.ok) throw new Error("案件の取得に失敗しました");
      const json = await res.json();
      setCases(json.cases ?? json.data ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, [filter, filterPriority, filterCategory, filterDateFrom, filterDateTo, filterQuery]);

  useEffect(() => {
    if (ready) fetchCases();
  }, [ready, fetchCases]);

  /* create case */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const body: Record<string, string> = {
        title: formTitle.trim(),
        description: formDesc.trim(),
        priority: formPriority,
        category: formCategory.trim(),
      };
      if (formCertId.trim()) body.certificate_id = formCertId.trim();
      if (formVehicleId.trim()) body.vehicle_id = formVehicleId.trim();

      const res = await fetch("/api/insurer/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("案件の作成に失敗しました");
      setFormTitle("");
      setFormDesc("");
      setFormPriority("normal");
      setFormCategory("");
      setFormCertId("");
      setFormVehicleId("");
      setShowForm(false);
      fetchCases();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-neutral-500">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-neutral-600">
            案件管理
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            案件管理
          </h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary self-start"
        >
          {showForm ? "キャンセル" : "新規案件"}
        </button>
      </header>

      {/* create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-neutral-900">新規案件作成</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="案件タイトルを入力"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                説明
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="案件の詳細を入力"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                優先度
              </label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="low">低</option>
                <option value="normal">通常</option>
                <option value="high">高</option>
                <option value="urgent">緊急</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                カテゴリ
              </label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="カテゴリ"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                証明書ID（任意）
              </label>
              <input
                type="text"
                value={formCertId}
                onChange={(e) => setFormCertId(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="証明書ID"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                車両ID（任意）
              </label>
              <input
                type="text"
                value={formVehicleId}
                onChange={(e) => setFormVehicleId(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="車両ID"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !formTitle.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? "作成中…" : "案件を作成"}
            </button>
          </div>
        </form>
      )}

      {/* filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === tab.key
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          {showAdvanced ? "詳細フィルタを閉じる" : "詳細フィルタ"}
        </button>
      </div>

      {/* advanced filters */}
      {showAdvanced && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                キーワード検索
              </label>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="タイトル・案件番号・説明"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                優先度
              </label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">全て</option>
                <option value="low">低</option>
                <option value="normal">通常</option>
                <option value="high">高</option>
                <option value="urgent">緊急</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                作成日（から）
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                作成日（まで）
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                カテゴリ
              </label>
              <input
                type="text"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                placeholder="カテゴリで絞り込み"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFilterPriority("");
                setFilterCategory("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterQuery("");
              }}
              className="text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
            >
              フィルタをリセット
            </button>
          </div>
        </div>
      )}

      {/* error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* table */}
      {busy ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-neutral-500">読み込み中…</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-neutral-500">案件がありません</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left">
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  案件番号
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  タイトル
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  ステータス
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  優先度
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  作成日
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">
                    {c.case_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {c.title}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(c.status)}`}
                    >
                      {STATUS_MAP[c.status]?.label ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClasses(c.priority)}`}
                    >
                      {PRIORITY_MAP[c.priority]?.label ?? c.priority}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                    {formatDateTime(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/insurer/cases/${c.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
