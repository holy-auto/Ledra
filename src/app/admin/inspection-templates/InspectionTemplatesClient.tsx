"use client";

import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import {
  INSPECTION_ITEM_TYPES,
  INSPECTION_ITEM_TYPE_LABEL,
  type InspectionItemType,
} from "@/lib/validations/inspection";

// ─── 型 ───
type TemplateItem = { id: string; label: string; type: InspectionItemType };

type TemplateRow = {
  id: string;
  name: string;
  items: TemplateItem[];
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ListResponse = { templates: TemplateRow[] };

/** 編集ダイアログで扱う草稿状態 (新規 / 既存共通)。 */
type Draft = {
  id: string | null;
  name: string;
  items: TemplateItem[];
  is_default: boolean;
};

function newItem(): TemplateItem {
  return { id: crypto.randomUUID(), label: "", type: "ok_ng" };
}

export default function InspectionTemplatesClient() {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useSWR<ListResponse>("/api/admin/inspection-templates", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });

  const templates = data?.templates ?? [];

  const openCreate = () => setEditing({ id: null, name: "", items: [newItem()], is_default: false });
  const openEdit = (t: TemplateRow) =>
    setEditing({
      id: t.id,
      name: t.name,
      items: Array.isArray(t.items) && t.items.length > 0 ? t.items : [newItem()],
      is_default: t.is_default,
    });

  const toggleActive = async (t: TemplateRow) => {
    setBusyId(t.id);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/inspection-templates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      await mutate();
    } catch (e) {
      setErrorMsg("更新に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        tag="点検"
        title="点検テンプレート"
        description="入庫 / 納車時の点検チェックリストを店舗ごとにカスタマイズします。項目タイプ（○×△・テキスト・数値）を選んで点検表を組み立てられます。"
        actions={
          <button type="button" onClick={openCreate} className="btn-primary">
            + テンプレート
          </button>
        }
      />

      {errorMsg && <div className="glass-card border-l-4 border-danger p-3 text-xs text-danger-text">{errorMsg}</div>}

      {isLoading && <div className="text-sm text-muted">読み込み中…</div>}
      {error && (
        <div className="glass-card p-4 text-sm text-danger-text">
          {error instanceof Error ? error.message : "読み込みに失敗しました"}
        </div>
      )}

      {data && templates.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="text-3xl">📋</div>
          <div className="mt-2 text-sm font-medium text-primary">点検テンプレートはまだありません</div>
          <p className="mt-1 text-xs text-muted">
            「+ テンプレート」から入庫点検 / 納車前点検などのチェックリストを作成できます。
          </p>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="glass-card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-primary">{t.name}</span>
                {t.is_default && <Badge variant="info">デフォルト</Badge>}
                {!t.is_active && <Badge variant="default">無効</Badge>}
              </div>
              <div className="mt-1 text-[12px] text-muted">項目 {Array.isArray(t.items) ? t.items.length : 0} 件</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => toggleActive(t)}
                disabled={busyId === t.id}
                className="btn-ghost text-xs disabled:opacity-50"
              >
                {t.is_active ? "無効化" : "有効化"}
              </button>
              <button type="button" onClick={() => openEdit(t)} className="btn-secondary text-xs">
                編集
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditTemplateDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

// ─── 編集ダイアログ ───
function EditTemplateDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(draft.name);
  const [items, setItems] = useState<TemplateItem[]>(draft.items);
  const [isDefault, setIsDefault] = useState(draft.is_default);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const updateItem = (idx: number, patch: Partial<TemplateItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, newItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const moveItem = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const submit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("テンプレート名は必須です。");
      return;
    }
    const cleanItems = items.map((it) => ({ ...it, label: it.label.trim() })).filter((it) => it.label.length > 0);
    if (cleanItems.length === 0) {
      setFormError("点検項目を 1 件以上追加してください。");
      return;
    }
    setSubmitting(true);
    try {
      const isUpdate = draft.id != null;
      const res = await fetch("/api/admin/inspection-templates", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate ? { id: draft.id } : {}),
          name: name.trim(),
          items: cleanItems,
          is_default: isDefault,
        }),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setFormError("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">
            {draft.id ? "テンプレートを編集" : "新規テンプレート"}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            ✕
          </button>
        </div>

        {formError && (
          <div className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger-text">
            {formError}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-secondary">
            テンプレート名<span className="ml-0.5 text-danger-text">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="入庫時点検"
            className="input-field w-full"
            maxLength={80}
          />
        </label>

        <label className="flex items-center gap-2 text-[13px] text-secondary">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          デフォルトの点検表にする
        </label>

        {/* 項目リスト */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-secondary">点検項目 ({items.length})</span>
          </div>
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg border border-border-subtle p-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    className="text-muted hover:text-primary disabled:opacity-30"
                    aria-label="上へ"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === items.length - 1}
                    className="text-muted hover:text-primary disabled:opacity-30"
                    aria-label="下へ"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={item.label}
                  onChange={(e) => updateItem(idx, { label: e.target.value })}
                  placeholder="項目名（例: ボディ傷・へこみ）"
                  className="input-field min-w-0 flex-1 text-[13px]"
                  maxLength={100}
                />
                <select
                  value={item.type}
                  onChange={(e) => updateItem(idx, { type: e.target.value as InspectionItemType })}
                  className="input-field w-28 shrink-0 text-[13px]"
                >
                  {INSPECTION_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INSPECTION_ITEM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="shrink-0 text-muted hover:text-danger-text"
                  aria-label="項目を削除"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={addItem} className="btn-ghost text-xs">
            + 項目を追加
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
            {submitting ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
