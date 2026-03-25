"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ── Types ── */

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  description: string | null;
}

interface Faq {
  id: string;
  category_id: string;
  category_name: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface FaqFormData {
  category_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
}

const EMPTY_FORM: FaqFormData = {
  category_id: "",
  question: "",
  answer: "",
  sort_order: 0,
  is_published: true,
};

const CATEGORY_BADGE_VARIANT: Record<string, BadgeVariant> = {
  service: "info",
  pricing: "success",
  contracts: "violet",
  "sales-tips": "warning",
  technical: "danger",
  other: "default",
};

/* ── Component ── */

export default function AdminFaqClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter
  const [filterCategory, setFilterCategory] = useState("all");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FaqFormData>(EMPTY_FORM);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* ── Fetch ── */

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agent-faq", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setCategories(json.categories ?? []);
        setFaqs(json.faqs ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Handlers ── */

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? "" });
    setShowForm(true);
  };

  const openEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setForm({
      category_id: faq.category_id,
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order,
      is_published: faq.is_published,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim() || !form.category_id) return;
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/agent-faq/${editingId}`
        : "/api/admin/agent-faq";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        closeForm();
        await fetchData();
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/agent-faq/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingId(null);
        await fetchData();
      }
    } catch {
      /* ignore */
    }
  };

  const updateField = <K extends keyof FaqFormData>(key: K, value: FaqFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Derived ── */

  const filtered =
    filterCategory === "all"
      ? faqs
      : faqs.filter((f) => f.category_id === filterCategory);

  const publishedCount = faqs.filter((f) => f.is_published).length;
  const totalViews = faqs.reduce((sum, f) => sum + (f.view_count ?? 0), 0);

  /* ── Render ── */

  if (loading) return <div className="text-sm text-muted">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
          <div className="mt-2 text-2xl font-bold text-primary">{faqs.length}</div>
          <div className="mt-1 text-xs text-muted">FAQ数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">公開中</div>
          <div className="mt-2 text-2xl font-bold text-success-text">{publishedCount}</div>
          <div className="mt-1 text-xs text-muted">公開FAQ</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">非公開</div>
          <div className="mt-2 text-2xl font-bold text-warning-text">{faqs.length - publishedCount}</div>
          <div className="mt-1 text-xs text-muted">下書きFAQ</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">閲覧数</div>
          <div className="mt-2 text-2xl font-bold text-accent-text">{totalViews.toLocaleString()}</div>
          <div className="mt-1 text-xs text-muted">合計閲覧数</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Category filter pills */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterCategory("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-accent text-inverse"
                : "bg-surface-hover text-secondary hover:bg-surface-active"
            }`}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilterCategory(cat.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterCategory === cat.id
                  ? "bg-accent text-inverse"
                  : "bg-surface-hover text-secondary hover:bg-surface-active"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-inverse shadow-sm transition-colors hover:bg-accent/90"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新規作成
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="glass-card border border-border-default p-6 space-y-5">
          <h2 className="text-base font-semibold text-primary">
            {editingId ? "FAQ編集" : "FAQ新規作成"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">カテゴリ</label>
              <select
                value={form.category_id}
                onChange={(e) => updateField("category_id", e.target.value)}
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">選択してください</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort order */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">表示順</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => updateField("sort_order", Number(e.target.value))}
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          {/* Question */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary">質問</label>
            <input
              type="text"
              value={form.question}
              onChange={(e) => updateField("question", e.target.value)}
              placeholder="よくある質問を入力..."
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {/* Answer */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary">回答</label>
            <textarea
              value={form.answer}
              onChange={(e) => updateField("answer", e.target.value)}
              rows={5}
              placeholder="回答を入力..."
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none resize-y focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {/* Published */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => updateField("is_published", e.target.checked)}
              className="h-4 w-4 rounded border-border-default text-accent focus:ring-accent/30"
            />
            <span className="text-sm text-secondary">公開する</span>
          </label>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.question.trim() || !form.answer.trim() || !form.category_id}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-inverse shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : editingId ? "更新" : "作成"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-full px-5 py-2 text-xs font-semibold text-secondary bg-surface-hover transition-colors hover:bg-surface-active"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* FAQ List */}
      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          FAQはありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((faq) => {
            const cat = categories.find((c) => c.id === faq.category_id);
            const slug = cat?.slug ?? "other";
            const badgeVariant: BadgeVariant = CATEGORY_BADGE_VARIANT[slug] ?? "default";

            return (
              <div
                key={faq.id}
                className="glass-card border border-border-default p-5 transition-all hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Top meta row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={badgeVariant}>{faq.category_name}</Badge>
                      <Badge variant={faq.is_published ? "success" : "default"}>
                        {faq.is_published ? "公開" : "非公開"}
                      </Badge>
                      <span className="text-[11px] text-muted">
                        表示順: {faq.sort_order}
                      </span>
                      <span className="text-[11px] text-muted">
                        閲覧: {faq.view_count.toLocaleString()}
                      </span>
                    </div>

                    {/* Question */}
                    <div className="text-sm font-semibold text-primary leading-snug">
                      Q. {faq.question}
                    </div>

                    {/* Answer (truncated) */}
                    <div className="text-sm text-secondary leading-relaxed line-clamp-2">
                      A. {faq.answer}
                    </div>

                    {/* Timestamps */}
                    <div className="flex flex-wrap gap-3 text-[11px] text-muted pt-1">
                      <span>作成: {formatDateTime(faq.created_at)}</span>
                      <span>更新: {formatDateTime(faq.updated_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(faq)}
                      className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                      title="編集"
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                      </svg>
                    </button>
                    {deletingId === faq.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(faq.id)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-danger-text bg-danger-dim transition-colors hover:bg-danger/20"
                        >
                          削除
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-secondary bg-surface-hover transition-colors hover:bg-surface-active"
                        >
                          戻る
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(faq.id)}
                        className="rounded-lg p-2 text-secondary transition-colors hover:bg-danger-dim hover:text-danger-text"
                        title="削除"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
