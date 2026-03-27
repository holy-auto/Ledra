"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

/* -- status / priority maps -- */

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
  { key: "open", label: "対応待ち" },
  { key: "in_progress", label: "対応中" },
  { key: "pending_tenant", label: "施工店確認中" },
  { key: "resolved", label: "解決済み" },
  { key: "closed", label: "クローズ" },
] as const;

const CASE_TEMPLATES = [
  { key: "", label: "テンプレートなし", title: "", category: "", description: "" },
  { key: "construction_check", label: "施工確認依頼", title: "施工確認依頼", category: "施工確認", description: "施工状態の確認をお願いします。対象車両の施工内容と現在の状態についてご報告ください。" },
  { key: "pii_disclosure", label: "PII開示確認", title: "個人情報開示確認", category: "PII開示", description: "保険事故調査のため、個人情報の開示確認を依頼します。双方の同意が必要です。" },
  { key: "claim_investigation", label: "保険金請求調査", title: "保険金請求調査", category: "保険金請求", description: "保険金請求に関する調査を依頼します。施工内容と証明書の整合性を確認してください。" },
  { key: "vehicle_condition", label: "車両状態確認", title: "車両状態確認依頼", category: "車両確認", description: "車両の現在の状態確認を依頼します。施工後の車両状態をご報告ください。" },
];

/* -- badge color helpers -- */

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

/* -- types -- */

type CaseRow = {
  id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
};

/* -- inner component (needs Suspense for useSearchParams) -- */

function InsurerCasesInner() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [filter, setFilter] = useState(searchParams.get("status") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Advanced filter state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  // Create-form state
  const [showForm, setShowForm] = useState(searchParams.get("create") === "true");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formCategory, setFormCategory] = useState("");
  const [formCertId, setFormCertId] = useState(searchParams.get("certificate_id") ?? "");
  const [formVehicleId, setFormVehicleId] = useState(searchParams.get("vehicle_id") ?? "");
  const [formTenantId, setFormTenantId] = useState(searchParams.get("tenant_id") ?? "");
  const [formTemplate, setFormTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Pre-fill form from URL store_name param
  const storeName = searchParams.get("store_name");
  useEffect(() => {
    if (storeName && !formTitle) {
      setFormTitle(`${storeName} への問い合わせ`);
      setFormCategory("店舗問い合わせ");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, [filter, filterPriority, filterCategory, filterDateFrom, filterDateTo, filterQuery]);

  useEffect(() => {
    if (ready) fetchCases();
  }, [ready, fetchCases]);

  /* apply template */
  function applyTemplate(key: string) {
    setFormTemplate(key);
    const tpl = CASE_TEMPLATES.find((t) => t.key === key);
    if (tpl && tpl.key) {
      setFormTitle(tpl.title);
      setFormCategory(tpl.category);
      setFormDesc(tpl.description);
    }
  }

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
      if (formTenantId.trim()) body.tenant_id = formTenantId.trim();

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
      setFormTenantId("");
      setFormTemplate("");
      setShowForm(false);
      fetchCases();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  /* bulk status change */
  async function handleBulk(status: "resolved" | "closed") {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/cases/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_ids: [...selectedIds], status }),
      });
      if (!res.ok) throw new Error("一括更新に失敗しました");
      fetchCases();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === cases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cases.map((c) => c.id)));
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
            {/* template selector */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                テンプレート
              </label>
              <select
                value={formTemplate}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {CASE_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>

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

            {formCertId && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  証明書ID
                </label>
                <input
                  type="text"
                  value={formCertId}
                  readOnly
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
              </div>
            )}

            {formVehicleId && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  車両ID
                </label>
                <input
                  type="text"
                  value={formVehicleId}
                  readOnly
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
              </div>
            )}
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

      {/* bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 shadow-lg">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size}件選択中
          </span>
          <div className="flex-1" />
          <button
            onClick={() => handleBulk("resolved")}
            disabled={bulkBusy}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            解決済みにする
          </button>
          <button
            onClick={() => handleBulk("closed")}
            disabled={bulkBusy}
            className="rounded-xl bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            クローズする
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            選択解除
          </button>
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
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === cases.length && cases.length > 0}
                    onChange={toggleAll}
                    className="rounded border-neutral-300"
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-600">案件番号</th>
                <th className="px-4 py-3 font-semibold text-neutral-600">タイトル</th>
                <th className="px-4 py-3 font-semibold text-neutral-600">ステータス</th>
                <th className="px-4 py-3 font-semibold text-neutral-600">優先度</th>
                <th className="px-4 py-3 font-semibold text-neutral-600">作成日</th>
                <th className="px-4 py-3 font-semibold text-neutral-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${selectedIds.has(c.id) ? "bg-blue-50" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded border-neutral-300"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">
                    {c.case_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {c.title}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(c.status)}`}>
                      {STATUS_MAP[c.status]?.label ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClasses(c.priority)}`}>
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

export default function InsurerCasesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><p className="text-sm text-neutral-500">読み込み中…</p></div>}>
      <InsurerCasesInner />
    </Suspense>
  );
}
