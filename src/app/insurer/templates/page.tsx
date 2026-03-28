"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Template = {
  id: string;
  name: string;
  title_template: string;
  category: string | null;
  default_priority: string;
  description_template: string | null;
  created_at: string;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "通常",
  high: "高",
  urgent: "緊急",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  normal: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

export default function InsurerTemplatesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formDesc, setFormDesc] = useState("");
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

  const fetchTemplates = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/templates");
      if (!res.ok) throw new Error("テンプレートの取得に失敗しました");
      const json = await res.json();
      setTemplates(json.templates ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchTemplates();
  }, [ready, fetchTemplates]);

  function resetForm() {
    setFormName("");
    setFormTitle("");
    setFormCategory("");
    setFormPriority("normal");
    setFormDesc("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setFormName(t.name);
    setFormTitle(t.title_template);
    setFormCategory(t.category ?? "");
    setFormPriority(t.default_priority);
    setFormDesc(t.description_template ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formTitle.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      // If editing, delete first then re-create (simple approach)
      if (editingId) {
        await fetch(`/api/insurer/templates?id=${editingId}`, { method: "DELETE" });
      }

      const res = await fetch("/api/insurer/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          title_template: formTitle.trim(),
          category: formCategory.trim() || null,
          default_priority: formPriority,
          description_template: formDesc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("テンプレートの保存に失敗しました");
      resetForm();
      fetchTemplates();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/templates?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      fetchTemplates();
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
            テンプレート管理
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            カスタム案件テンプレート
          </h1>
          <p className="text-sm text-neutral-500">
            よく使う案件パターンをテンプレートとして保存できます
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}
          className="btn-primary self-start"
        >
          {showForm ? "キャンセル" : "新規テンプレート作成"}
        </button>
      </header>

      {/* create/edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-neutral-900">
            {editingId ? "テンプレート編集" : "新規テンプレート作成"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                テンプレート名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="例: 施工確認依頼"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                タイトルテンプレート <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="案件のタイトルテンプレート"
              />
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
                デフォルト優先度
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

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                説明テンプレート
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="案件の説明テンプレート"
              />
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
              disabled={submitting || !formName.trim() || !formTitle.trim()}
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

      {/* template list */}
      {busy ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-neutral-500">読み込み中…</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-neutral-500">カスタムテンプレートがありません</p>
          <p className="mt-1 text-sm text-neutral-400">
            「新規テンプレート作成」ボタンから作成できます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-neutral-900 truncate">
                      {t.name}
                    </h3>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[t.default_priority] ?? PRIORITY_COLORS.normal}`}
                    >
                      {PRIORITY_LABELS[t.default_priority] ?? t.default_priority}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 truncate">
                    タイトル: {t.title_template}
                  </p>
                  {t.category && (
                    <p className="text-sm text-neutral-500 mt-0.5">
                      カテゴリ: {t.category}
                    </p>
                  )}
                  {t.description_template && (
                    <p className="text-sm text-neutral-400 mt-1 line-clamp-2">
                      {t.description_template}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(t)}
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
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
