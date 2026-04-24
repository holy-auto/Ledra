"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ---------- Types ---------- */

type Category = "basic" | "advanced" | "product" | "sales" | "compliance";
type ContentType = "video" | "document" | "quiz" | "mixed";

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  content_type: ContentType;
  content_url: string | null;
  thumbnail_url: string | null;
  duration_min: number | null;
  sort_order: number;
  is_required: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/* ---------- Maps ---------- */

const CATEGORY_MAP: Record<Category, { label: string; variant: BadgeVariant }> = {
  basic: { label: "基礎", variant: "info" },
  advanced: { label: "応用", variant: "violet" },
  product: { label: "製品", variant: "success" },
  sales: { label: "営業", variant: "warning" },
  compliance: { label: "コンプライアンス", variant: "danger" },
};

const CONTENT_TYPE_MAP: Record<ContentType, string> = {
  video: "動画",
  document: "資料",
  quiz: "クイズ",
  mixed: "複合",
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "basic", label: "基礎" },
  { value: "advanced", label: "応用" },
  { value: "product", label: "製品" },
  { value: "sales", label: "営業" },
  { value: "compliance", label: "コンプライアンス" },
];

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "document", label: "資料" },
  { value: "quiz", label: "クイズ" },
  { value: "mixed", label: "複合" },
];

/* ---------- Empty form ---------- */

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "basic" as Category,
  content_type: "video" as ContentType,
  content_url: "",
  thumbnail_url: "",
  duration_min: "",
  sort_order: "0",
  is_required: false,
  is_published: true,
};

/* ---------- Component ---------- */

export default function AdminTrainingClient() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  /* Create / Edit form */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* Delete */
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* Category filter */
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");

  /* ---------- Fetch ---------- */

  const fetchCourses = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/agent-training", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setCourses(j.courses ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchCourses();
      setLoading(false);
    })();
  }, [fetchCourses]);

  /* ---------- Form helpers ---------- */

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setSaveMsg(null);
  };

  const openEditForm = (course: Course) => {
    setEditingId(course.id);
    setForm({
      title: course.title,
      description: course.description ?? "",
      category: course.category,
      content_type: course.content_type,
      content_url: course.content_url ?? "",
      thumbnail_url: course.thumbnail_url ?? "",
      duration_min: course.duration_min != null ? String(course.duration_min) : "",
      sort_order: String(course.sort_order),
      is_required: course.is_required,
      is_published: course.is_published,
    });
    setShowForm(true);
    setSaveMsg(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  /* ---------- Create ---------- */

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/agent-training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          content_type: form.content_type,
          content_url: form.content_url.trim() || null,
          thumbnail_url: form.thumbnail_url.trim() || null,
          duration_min: form.duration_min ? parseInt(form.duration_min, 10) : null,
          sort_order: parseInt(form.sort_order, 10) || 0,
          is_required: form.is_required,
          is_published: form.is_published,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      closeForm();
      setSaveMsg({ text: `コース「${j.course?.title ?? form.title}」を登録しました`, ok: true });
      await fetchCourses();
    } catch (e: unknown) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Update ---------- */

  const handleUpdate = async () => {
    if (!editingId || !form.title.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-training/${editingId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          content_type: form.content_type,
          content_url: form.content_url.trim() || null,
          thumbnail_url: form.thumbnail_url.trim() || null,
          duration_min: form.duration_min ? parseInt(form.duration_min, 10) : null,
          sort_order: parseInt(form.sort_order, 10) || 0,
          is_required: form.is_required,
          is_published: form.is_published,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      closeForm();
      setSaveMsg({ text: "コースを更新しました", ok: true });
      await fetchCourses();
    } catch (e: unknown) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Delete ---------- */

  const handleDelete = async (id: string) => {
    if (!confirm("このコースを削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/agent-training/${id}`, {
        method: "DELETE",
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: "コースを削除しました", ok: true });
      await fetchCourses();
    } catch (e: unknown) {
      alert("削除に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- Derived ---------- */

  const filtered = categoryFilter === "all" ? courses : courses.filter((c) => c.category === categoryFilter);
  const publishedCount = courses.filter((c) => c.is_published).length;
  const requiredCount = courses.filter((c) => c.is_required).length;

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
          <div className="mt-2 text-2xl font-bold text-primary">{courses.length}</div>
          <div className="mt-1 text-xs text-muted">コース数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">公開中</div>
          <div className="mt-2 text-2xl font-bold text-success-text">{publishedCount}</div>
          <div className="mt-1 text-xs text-muted">公開コース</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">必須</div>
          <div className="mt-2 text-2xl font-bold text-danger-text">{requiredCount}</div>
          <div className="mt-1 text-xs text-muted">必須コース</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">非公開</div>
          <div className="mt-2 text-2xl font-bold text-secondary">{courses.length - publishedCount}</div>
          <div className="mt-1 text-xs text-muted">非公開コース</div>
        </div>
      </div>

      {/* Toolbar: filter + create button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === "all"
                ? "bg-accent text-inverse"
                : "bg-surface-hover text-secondary hover:bg-surface-active"
            }`}
          >
            すべて
          </button>
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategoryFilter(opt.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === opt.value
                  ? "bg-accent text-inverse"
                  : "bg-surface-hover text-secondary hover:bg-surface-active"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={openCreateForm}>
          新規作成
        </button>
      </div>

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>}

      {/* Create / Edit Form */}
      {showForm && (
        <section className="glass-card p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">{editingId ? "編集" : "新規登録"}</div>
            <div className="mt-1 text-base font-semibold text-primary">
              {editingId ? "コース編集" : "新規コース登録"}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted">
                タイトル <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="例: コーティング基礎研修"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted">説明</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="コースの概要・目的を記載"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs text-muted">カテゴリ</label>
              <select
                className="select-field"
                value={form.category}
                onChange={(e) => setField("category", e.target.value as Category)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Content Type */}
            <div className="space-y-1">
              <label className="text-xs text-muted">コンテンツ種別</label>
              <select
                className="select-field"
                value={form.content_type}
                onChange={(e) => setField("content_type", e.target.value as ContentType)}
              >
                {CONTENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Content URL */}
            <div className="space-y-1">
              <label className="text-xs text-muted">コンテンツURL</label>
              <input
                type="url"
                className="input-field"
                placeholder="https://..."
                value={form.content_url}
                onChange={(e) => setField("content_url", e.target.value)}
              />
            </div>

            {/* Thumbnail URL */}
            <div className="space-y-1">
              <label className="text-xs text-muted">サムネイルURL</label>
              <input
                type="url"
                className="input-field"
                placeholder="https://..."
                value={form.thumbnail_url}
                onChange={(e) => setField("thumbnail_url", e.target.value)}
              />
            </div>

            {/* Duration */}
            <div className="space-y-1">
              <label className="text-xs text-muted">所要時間（分）</label>
              <input
                type="number"
                className="input-field"
                min="0"
                placeholder="30"
                value={form.duration_min}
                onChange={(e) => setField("duration_min", e.target.value)}
              />
            </div>

            {/* Sort Order */}
            <div className="space-y-1">
              <label className="text-xs text-muted">表示順</label>
              <input
                type="number"
                className="input-field"
                min="0"
                placeholder="0"
                value={form.sort_order}
                onChange={(e) => setField("sort_order", e.target.value)}
              />
            </div>

            {/* Checkboxes */}
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border-default text-accent focus:ring-accent"
                  checked={form.is_required}
                  onChange={(e) => setField("is_required", e.target.checked)}
                />
                必須コース
              </label>
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border-default text-accent focus:ring-accent"
                  checked={form.is_published}
                  onChange={(e) => setField("is_published", e.target.checked)}
                />
                公開する
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !form.title.trim()}
              onClick={editingId ? handleUpdate : handleCreate}
            >
              {saving ? "保存中..." : editingId ? "更新" : "登録"}
            </button>
            <button type="button" className="btn-ghost" onClick={closeForm}>
              キャンセル
            </button>
          </div>
        </section>
      )}

      {/* Course List */}
      {!loading && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">コース一覧</div>
            <div className="mt-1 text-base font-semibold text-primary">研修コース一覧（{filtered.length}件）</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">タイトル</th>
                  <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    カテゴリ
                  </th>
                  <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    種別
                  </th>
                  <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    時間
                  </th>
                  <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    必須
                  </th>
                  <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    状態
                  </th>
                  <th className="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    更新日
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((course) => {
                  const cat = CATEGORY_MAP[course.category] ?? CATEGORY_MAP.basic;
                  return (
                    <tr key={course.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-primary">{course.title}</span>
                          {!course.content_url && (
                            <span className="rounded-full bg-warning-dim text-warning-text">URL未設定</span>
                          )}
                        </div>
                        {course.description && (
                          <div className="mt-0.5 text-xs text-muted line-clamp-1">{course.description}</div>
                        )}
                        {/* Mobile-only badges */}
                        <div className="flex gap-1.5 mt-1 md:hidden">
                          <Badge variant={cat.variant}>{cat.label}</Badge>
                          <Badge>{CONTENT_TYPE_MAP[course.content_type] ?? course.content_type}</Badge>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-5 py-3.5">
                        <Badge variant={cat.variant}>{cat.label}</Badge>
                      </td>
                      <td className="hidden md:table-cell px-5 py-3.5">
                        <Badge>{CONTENT_TYPE_MAP[course.content_type] ?? course.content_type}</Badge>
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5 text-secondary whitespace-nowrap">
                        {course.duration_min != null ? `${course.duration_min}分` : "-"}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5">
                        {course.is_required ? (
                          <Badge variant="danger">必須</Badge>
                        ) : (
                          <span className="text-muted text-xs">-</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5">
                        <Badge variant={course.is_published ? "success" : "default"}>
                          {course.is_published ? "公開" : "非公開"}
                        </Badge>
                      </td>
                      <td className="hidden lg:table-cell px-5 py-3.5 text-xs text-muted whitespace-nowrap">
                        {formatDateTime(course.updated_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs"
                            onClick={() => openEditForm(course)}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="btn-danger px-3 py-1 text-xs"
                            disabled={deletingId === course.id}
                            onClick={() => handleDelete(course.id)}
                          >
                            {deletingId === course.id ? "削除中..." : "削除"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted">
                      コースが登録されていません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
