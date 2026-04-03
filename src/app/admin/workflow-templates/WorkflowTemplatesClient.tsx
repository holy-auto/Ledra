"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import WorkflowTemplateEditor from "@/components/workflow/WorkflowTemplateEditor";
import type { WorkflowStep } from "@/components/workflow/WorkflowTemplateEditor";

type Template = {
  id: string;
  name: string;
  service_type: string;
  steps: WorkflowStep[];
  is_default: boolean;
  is_platform: boolean;
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  coating: "コーティング",
  ppf: "PPF",
  wrapping: "ラッピング",
  body_repair: "板金修理",
  other: "その他",
};

const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }));

const EMPTY_FORM = {
  name: "",
  service_type: "coating",
  steps: [] as WorkflowStep[],
  is_default: false,
};

export default function WorkflowTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Fetch ───

  const fetchTemplates = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/workflow-templates", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setTemplates(j.templates ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchTemplates();
      setLoading(false);
    })();
  }, [fetchTemplates]);

  // ─── Form handlers ───

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setSaveMsg(null);
  };

  const openEditForm = (t: Template) => {
    if (t.is_platform) return; // プラットフォームテンプレートは編集不可
    setEditingId(t.id);
    setForm({ name: t.name, service_type: t.service_type, steps: t.steps, is_default: t.is_default });
    setShowForm(true);
    setSaveMsg(null);
  };

  const handleCopyTemplate = (t: Template) => {
    setEditingId(null);
    setForm({
      name: `${t.name}（コピー）`,
      service_type: t.service_type,
      steps: t.steps.map((s) => ({ ...s })),
      is_default: false,
    });
    setShowForm(true);
    setSaveMsg(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.steps.length === 0) {
      setSaveMsg({ text: "テンプレート名とステップは必須です", ok: false });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const url = editingId ? `/api/admin/workflow-templates/${editingId}` : "/api/admin/workflow-templates";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: editingId ? "テンプレートを更新しました" : "テンプレートを作成しました", ok: true });
      closeForm();
      await fetchTemplates();
    } catch (e: unknown) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このテンプレートを削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/workflow-templates/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: "テンプレートを削除しました", ok: true });
      await fetchTemplates();
    } catch (e: unknown) {
      alert("削除に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Derived ───
  const platformTemplates = templates.filter((t) => t.is_platform);
  const tenantTemplates = templates.filter((t) => !t.is_platform);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="WORKFLOW"
        title="ワークフローテンプレート"
        description="来店〜会計の作業フローをカスタマイズします。"
        actions={
          <button type="button" className="btn-primary" onClick={openCreateForm}>
            新規作成
          </button>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}
      {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-emerald-400" : "text-red-500"}`}>{saveMsg.text}</div>}

      {/* プラットフォーム共通テンプレート */}
      {platformTemplates.length > 0 && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">プラットフォーム共通</div>
            <div className="mt-1 text-base font-semibold text-primary">デフォルトテンプレート</div>
            <p className="mt-1 text-xs text-muted">Ledraが提供するテンプレートです。コピーして編集できます。</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {platformTemplates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{t.name}</span>
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">
                      {SERVICE_TYPE_LABELS[t.service_type] ?? t.service_type}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {t.steps.length}ステップ · 合計 {t.steps.reduce((s, st) => s + st.estimated_min, 0)}分
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyTemplate(t)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  コピーして編集
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* テナント固有テンプレート */}
      <section className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">カスタムテンプレート</div>
          <div className="mt-1 text-base font-semibold text-primary">
            あなたの店舗のテンプレート（{tenantTemplates.length}件）
          </div>
        </div>
        {!loading && tenantTemplates.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            <p>カスタムテンプレートがありません。</p>
            <button type="button" onClick={openCreateForm} className="mt-3 btn-primary text-xs">
              + 新規作成
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {tenantTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{t.name}</span>
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">
                      {SERVICE_TYPE_LABELS[t.service_type] ?? t.service_type}
                    </span>
                    {t.is_default && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-700">
                        デフォルト
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {t.steps.length}ステップ · 合計 {t.steps.reduce((s, st) => s + st.estimated_min, 0)}分 · 顧客通知{" "}
                    {t.steps.filter((s) => s.is_customer_visible).length}件
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEditForm(t)} className="btn-secondary px-3 py-1.5 text-xs">
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="btn-secondary px-3 py-1.5 text-xs text-red-500"
                  >
                    {deletingId === t.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── フォームモーダル ─── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeForm}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-primary">
                {editingId ? "テンプレート編集" : "新規テンプレート作成"}
              </h2>
              <button type="button" onClick={closeForm} className="p-1 rounded-lg hover:bg-surface-hover text-muted">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* テンプレート名 */}
              <div className="space-y-1">
                <label className="text-xs text-muted">
                  テンプレート名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="例: ガラスコーティング標準"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* サービス種別 */}
              <div className="space-y-1">
                <label className="text-xs text-muted">サービス種別</label>
                <select
                  className="select-field"
                  value={form.service_type}
                  onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
                >
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ステップエディター */}
              <div className="space-y-1">
                <label className="text-xs text-muted">
                  作業ステップ <span className="text-red-500">*</span>
                </label>
                <div className="text-[11px] text-muted mb-2">
                  📱マークのついたステップ完了時に顧客にLINE通知が送られます
                </div>
                <WorkflowTemplateEditor steps={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} />
              </div>

              {/* デフォルト設定 */}
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border-default text-accent focus:ring-accent"
                  checked={form.is_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                />
                このサービス種別のデフォルトテンプレートにする
              </label>

              {saveMsg && (
                <div className={`text-sm ${saveMsg.ok ? "text-emerald-400" : "text-red-500"}`}>{saveMsg.text}</div>
              )}

              {/* ボタン */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={saving || !form.name.trim() || form.steps.length === 0}
                  onClick={handleSave}
                >
                  {saving ? "保存中..." : editingId ? "更新" : "作成"}
                </button>
                <button type="button" className="btn-ghost px-4" onClick={closeForm}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
