"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Rule = {
  id: string;
  name: string;
  condition_type: string;
  condition_value: string;
  assign_to: string;
  is_active: boolean;
  created_at: string;
};

type InsurerUser = {
  id: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
};

const CONDITION_TYPE_LABELS: Record<string, string> = {
  category: "カテゴリ一致",
  tenant: "施工店一致",
  priority: "優先度一致",
};

const CONDITION_TYPE_OPTIONS = [
  { value: "category", label: "カテゴリ一致" },
  { value: "tenant", label: "施工店一致" },
  { value: "priority", label: "優先度一致" },
];

export default function InsurerRulesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<InsurerUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("category");
  const [formValue, setFormValue] = useState("");
  const [formAssignTo, setFormAssignTo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  const fetchRules = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/rules");
      if (!res.ok) throw new Error("ルールの取得に失敗しました");
      const json = await res.json();
      setRules(json.rules ?? []);
      setUsers(json.users ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchRules();
  }, [ready, fetchRules]);

  function resetForm() {
    setFormName("");
    setFormType("category");
    setFormValue("");
    setFormAssignTo("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormType(r.condition_type);
    setFormValue(r.condition_value);
    setFormAssignTo(r.assign_to);
    setShowForm(true);
  }

  function getUserName(userId: string): string {
    const u = users.find((u) => u.id === userId);
    return u?.display_name || "（不明）";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formValue.trim() || !formAssignTo) return;
    setSubmitting(true);
    setErr(null);
    try {
      if (editingId) {
        // Update existing rule
        const res = await fetch("/api/insurer/rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            name: formName.trim(),
            condition_type: formType,
            condition_value: formValue.trim(),
            assign_to: formAssignTo,
          }),
        });
        if (!res.ok) throw new Error("ルールの更新に失敗しました");
      } else {
        const res = await fetch("/api/insurer/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            condition_type: formType,
            condition_value: formValue.trim(),
            assign_to: formAssignTo,
          }),
        });
        if (!res.ok) throw new Error("ルールの作成に失敗しました");
      }
      resetForm();
      fetchRules();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(rule: Rule) {
    setErr(null);
    try {
      const res = await fetch("/api/insurer/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      fetchRules();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このルールを削除しますか？")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/rules?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      fetchRules();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
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
            自動振り分け
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            案件自動振り分けルール
          </h1>
          <p className="text-sm text-neutral-500">
            条件に基づいて案件を自動的に担当者に振り分けます
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}
          className="btn-primary self-start"
        >
          {showForm ? "キャンセル" : "新規ルール作成"}
        </button>
      </header>

      {/* create/edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-neutral-900">
            {editingId ? "ルール編集" : "新規ルール作成"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                ルール名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="例: 施工確認案件を田中さんに割り当て"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                条件タイプ <span className="text-red-500">*</span>
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {CONDITION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                条件値 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={
                  formType === "category"
                    ? "カテゴリ名（例: 施工確認）"
                    : formType === "priority"
                      ? "優先度（例: urgent）"
                      : "施工店ID"
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                割り当て先 <span className="text-red-500">*</span>
              </label>
              {users.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  アクティブなユーザーが見つかりません
                </p>
              ) : (
                <select
                  value={formAssignTo}
                  onChange={(e) => setFormAssignTo(e.target.value)}
                  required
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">担当者を選択</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.id} ({u.role})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting || !formName.trim() || !formValue.trim() || !formAssignTo}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? "保存中…" : editingId ? "更新" : "作成"}
            </button>
          </div>
        </form>
      )}

      {/* error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* rules list */}
      {busy ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-neutral-500">読み込み中…</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-neutral-500">自動振り分けルールがありません</p>
          <p className="mt-1 text-sm text-neutral-400">
            「新規ルール作成」ボタンからルールを追加できます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border bg-white p-5 transition ${
                r.is_active
                  ? "border-neutral-200 hover:border-neutral-300"
                  : "border-neutral-100 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-neutral-900 truncate">
                      {r.name}
                    </h3>
                    {!r.is_active && (
                      <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-500">
                        無効
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
                    <span>
                      条件:{" "}
                      <span className="font-medium">
                        {CONDITION_TYPE_LABELS[r.condition_type] ?? r.condition_type}
                      </span>{" "}
                      = <span className="font-mono text-neutral-800">{r.condition_value}</span>
                    </span>
                    <span>
                      割り当て先:{" "}
                      <span className="font-medium">{getUserName(r.assign_to)}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(r)}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                      r.is_active
                        ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                        : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {r.is_active ? "無効化" : "有効化"}
                  </button>
                  <button
                    onClick={() => startEdit(r)}
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
