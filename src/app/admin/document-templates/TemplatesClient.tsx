"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { DOC_TYPE_LIST, type DocType } from "@/types/document";
import { DEFAULT_LAYOUT, mergeLayout, type LayoutConfig, type DocumentTemplate } from "@/types/documentTemplate";
import LayoutPreview from "./LayoutPreview";

type ApiResp = {
  templates: DocumentTemplate[];
  tenant_default_template_id: string | null;
};

type EditorState = {
  id: string | null;
  name: string;
  doc_type: DocType | null;
  is_default: boolean;
  layout: LayoutConfig;
};

const NEW_STATE = (): EditorState => ({
  id: null,
  name: "新しいテンプレート",
  doc_type: null,
  is_default: false,
  layout: DEFAULT_LAYOUT,
});

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [tenantDefaultId, setTenantDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/document-templates", { cache: "no-store" });
      const j = (await res.json()) as ApiResp;
      if (!res.ok) throw new Error((j as any)?.message ?? "読み込み失敗");
      setTemplates(j.templates ?? []);
      setTenantDefaultId(j.tenant_default_template_id ?? null);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => setEditor(NEW_STATE());
  const startEdit = (t: DocumentTemplate) =>
    setEditor({
      id: t.id,
      name: t.name,
      doc_type: t.doc_type,
      is_default: t.is_default,
      layout: mergeLayout(DEFAULT_LAYOUT, t.layout_config),
    });
  const cancelEdit = () => {
    setEditor(null);
    setMsg(null);
  };

  const updateLayout = (partial: Partial<LayoutConfig>) => {
    if (!editor) return;
    setEditor({ ...editor, layout: mergeLayout(editor.layout, partial) });
  };

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setMsg(null);
    try {
      const isUpdate = Boolean(editor.id);
      const res = await fetch("/api/admin/document-templates", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate ? { id: editor.id } : {}),
          name: editor.name,
          doc_type: editor.doc_type,
          is_default: editor.is_default,
          layout_config: editor.layout,
        }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "保存しました", ok: true });
      await load();
      if (j?.template) {
        setEditor({
          id: j.template.id,
          name: j.template.name,
          doc_type: j.template.doc_type,
          is_default: j.template.is_default,
          layout: mergeLayout(DEFAULT_LAYOUT, j.template.layout_config),
        });
      }
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("このテンプレートを削除しますか？")) return;
    try {
      const res = await fetch("/api/admin/document-templates", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (editor?.id === id) setEditor(null);
      await load();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    }
  };

  const setTenantDefault = async (id: string | null) => {
    try {
      const res = await fetch("/api/admin/document-templates/tenant-default", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template_id: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTenantDefaultId(id);
    } catch (e: any) {
      alert("既定の設定に失敗しました: " + (e?.message ?? String(e)));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        tag="帳票"
        title="帳票テンプレート"
        description="見積書・請求書などのレイアウトを作成・編集できます。作成したテンプレートを書類作成時に選択すると、指定のレイアウトで PDF が生成されます。"
        actions={
          <button type="button" className="btn-primary" onClick={startNew}>
            新規作成
          </button>
        }
      />

      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}
      {loading && <div className="text-sm text-muted">読み込み中…</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Templates list */}
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">テンプレート一覧</div>
          </div>
          <ul className="divide-y divide-border-subtle">
            {templates.length === 0 && !loading && (
              <li className="p-5 text-sm text-muted">
                まだテンプレートがありません。「新規作成」から追加してください。
              </li>
            )}
            {templates.map((t) => (
              <li
                key={t.id}
                className={`p-4 text-sm flex items-center justify-between gap-3 ${
                  editor?.id === t.id ? "bg-surface-hover" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-primary truncate">{t.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {t.doc_type ? (DOC_TYPE_LIST.find((d) => d.value === t.doc_type)?.label ?? t.doc_type) : "共通"}
                    {t.is_default && <span className="ml-2 text-accent">★ 種別デフォルト</span>}
                    {tenantDefaultId === t.id && <span className="ml-2 text-info">● テナント既定</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={() => startEdit(t)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => setTenantDefault(tenantDefaultId === t.id ? null : t.id)}
                  >
                    {tenantDefaultId === t.id ? "既定解除" : "既定に設定"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1 text-danger"
                    onClick={() => remove(t.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Editor + Preview */}
        <section className="glass-card p-5 space-y-5">
          {!editor ? (
            <div className="text-sm text-muted">
              左のリストから編集、または「新規作成」で新しいテンプレートを作ってください。
            </div>
          ) : (
            <EditorForm
              editor={editor}
              setEditor={setEditor}
              updateLayout={updateLayout}
              saving={saving}
              msg={msg}
              onSave={save}
              onCancel={cancelEdit}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function EditorForm({
  editor,
  setEditor,
  updateLayout,
  saving,
  msg,
  onSave,
  onCancel,
}: {
  editor: EditorState;
  setEditor: (s: EditorState) => void;
  updateLayout: (p: Partial<LayoutConfig>) => void;
  saving: boolean;
  msg: { text: string; ok: boolean } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const previewProps = useMemo(() => editor.layout, [editor.layout]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-primary">
          {editor.id ? "テンプレートを編集" : "新規テンプレート"}
        </div>
        {msg && <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      </div>

      {/* 基本情報 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted">テンプレート名</label>
          <input
            type="text"
            className="input-field"
            value={editor.name}
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted">対象の帳票種別</label>
          <select
            className="select-field"
            value={editor.doc_type ?? ""}
            onChange={(e) => setEditor({ ...editor, doc_type: (e.target.value || null) as DocType | null })}
          >
            <option value="">共通（すべての帳票）</option>
            {DOC_TYPE_LIST.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={editor.is_default}
            onChange={(e) => setEditor({ ...editor, is_default: e.target.checked })}
            className="rounded"
          />
          この種別のデフォルトテンプレートにする
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 設定フォーム */}
        <div className="space-y-5">
          {/* タイトル */}
          <Section title="タイトル">
            <Toggle
              label="「御」プレフィックスを付ける（例：御見積書）"
              checked={editor.layout.title.prefix}
              onChange={(v) => updateLayout({ title: { ...editor.layout.title, prefix: v } })}
            />
            <Select
              label="配置"
              value={editor.layout.title.align}
              options={[
                { value: "center", label: "中央" },
                { value: "left", label: "左" },
                { value: "right", label: "右" },
              ]}
              onChange={(v) =>
                updateLayout({
                  title: { ...editor.layout.title, align: v as LayoutConfig["title"]["align"] },
                })
              }
            />
            <Number
              label="文字サイズ"
              value={editor.layout.title.fontSize}
              min={12}
              max={36}
              onChange={(v) => updateLayout({ title: { ...editor.layout.title, fontSize: v } })}
            />
            <Number
              label="字間 (letter-spacing)"
              value={editor.layout.title.spacing}
              min={0}
              max={20}
              onChange={(v) => updateLayout({ title: { ...editor.layout.title, spacing: v } })}
            />
          </Section>

          {/* 発行者ブロック */}
          <Section title="発行者・ロゴ・角印">
            <Select
              label="発行者ブロックの位置"
              value={editor.layout.issuer.position}
              options={[
                { value: "top-right", label: "右上" },
                { value: "top-left", label: "左上" },
              ]}
              onChange={(v) =>
                updateLayout({
                  issuer: {
                    ...editor.layout.issuer,
                    position: v as LayoutConfig["issuer"]["position"],
                  },
                })
              }
            />
            <Select
              label="発行者テキストの揃え"
              value={editor.layout.issuer.align}
              options={[
                { value: "right", label: "右揃え" },
                { value: "left", label: "左揃え" },
              ]}
              onChange={(v) =>
                updateLayout({
                  issuer: {
                    ...editor.layout.issuer,
                    align: v as LayoutConfig["issuer"]["align"],
                  },
                })
              }
            />
            <Toggle
              label="ロゴを表示"
              checked={editor.layout.logo.show}
              onChange={(v) => updateLayout({ logo: { ...editor.layout.logo, show: v } })}
            />
            <Number
              label="ロゴ高さ (px)"
              value={editor.layout.logo.height}
              min={20}
              max={160}
              onChange={(v) => updateLayout({ logo: { ...editor.layout.logo, height: v } })}
            />
            <Toggle
              label="角印を表示"
              checked={editor.layout.seal.show}
              onChange={(v) => updateLayout({ seal: { ...editor.layout.seal, show: v } })}
            />
            <Number
              label="角印サイズ (px)"
              value={editor.layout.seal.size}
              min={30}
              max={140}
              onChange={(v) => updateLayout({ seal: { ...editor.layout.seal, size: v } })}
            />
          </Section>

          {/* 宛先ブロック */}
          <Section title="宛先">
            <Toggle
              label="郵便番号を表示"
              checked={editor.layout.recipient.showPostalCode}
              onChange={(v) =>
                updateLayout({
                  recipient: { ...editor.layout.recipient, showPostalCode: v },
                })
              }
            />
            <Toggle
              label="住所を表示"
              checked={editor.layout.recipient.showAddress}
              onChange={(v) =>
                updateLayout({
                  recipient: { ...editor.layout.recipient, showAddress: v },
                })
              }
            />
            <Toggle
              label="電話番号を表示"
              checked={editor.layout.recipient.showPhone}
              onChange={(v) =>
                updateLayout({
                  recipient: { ...editor.layout.recipient, showPhone: v },
                })
              }
            />
          </Section>

          {/* 明細表 */}
          <Section title="明細">
            <Toggle
              label="単位列を表示"
              checked={editor.layout.items.showUnit}
              onChange={(v) => updateLayout({ items: { ...editor.layout.items, showUnit: v } })}
            />
            <Toggle
              label="軽減税率マーク（※軽減）を表示"
              checked={editor.layout.items.showTaxLabel}
              onChange={(v) => updateLayout({ items: { ...editor.layout.items, showTaxLabel: v } })}
            />
          </Section>

          {/* 配色・サイズ */}
          <Section title="配色・基本サイズ">
            <Color
              label="アクセント色（合計ラベル・角印枠）"
              value={editor.layout.colors.primary}
              onChange={(v) => updateLayout({ colors: { ...editor.layout.colors, primary: v } })}
            />
            <Color
              label="明細ヘッダー下線色"
              value={editor.layout.colors.headerRule}
              onChange={(v) => updateLayout({ colors: { ...editor.layout.colors, headerRule: v } })}
            />
            <Number
              label="本文フォントサイズ"
              value={editor.layout.fontSizeBase}
              min={7}
              max={14}
              onChange={(v) => updateLayout({ fontSizeBase: v })}
            />
          </Section>
        </div>

        {/* プレビュー */}
        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">プレビュー</div>
          <LayoutPreview layout={previewProps} docType={editor.doc_type ?? "estimate"} />
          <div className="text-xs text-muted">
            ※ プレビューは HTML による簡易表示です。実際の PDF では字間・行間が若干異なります。
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
          {saving ? "保存中…" : editor.id ? "更新" : "作成"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border border-border-subtle rounded-lg p-4">
      <div className="text-xs font-semibold tracking-[0.14em] text-secondary">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      {label}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select className="select-field max-w-[60%]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Number({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
        <input
          type="number"
          className="input-field w-20 py-1"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
        />
      </div>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 rounded border border-border-subtle"
        />
        <input type="text" className="input-field w-24 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
