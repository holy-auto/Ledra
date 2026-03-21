"use client";

import { useMemo, useRef, useState } from "react";

type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";
type Field = { key: string; label: string; type: FieldType; options?: string[]; required?: boolean };
type Section = { title: string; fields: Field[] };
type Schema = { version: number; sections: Section[] };

const TYPE_LABELS: Record<FieldType, string> = {
  text: "テキスト",
  textarea: "テキスト（複数行）",
  number: "数値",
  date: "日付",
  select: "選択（単一）",
  multiselect: "選択（複数）",
  checkbox: "チェックボックス",
};

function slugKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40) || "field";
}

function computeDupKeys(schema: Schema) {
  const counts = new Map<string, number>();
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      const k = (f.key ?? "").trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const dups = new Set<string>();
  for (const [k, c] of counts.entries()) if (c >= 2) dups.add(k);
  return dups;
}

// ── Inline Add Field Form ──
function AddFieldForm({ onAdd, onCancel }: { onAdd: (f: Field) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");

  const autoKey = useMemo(() => slugKey(label), [label]);
  const effectiveKey = key.trim() || autoKey;
  const needsOptions = type === "select" || type === "multiselect";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const field: Field = { key: effectiveKey, label: label.trim(), type, required };
    if (needsOptions) {
      field.options = options.split(",").map((x) => x.trim()).filter(Boolean);
    }
    onAdd(field);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="text-xs font-semibold text-blue-700">項目を追加</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-blue-600">ラベル名 *</div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: ブランド名" required autoFocus className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-blue-600">キー（自動生成）</div>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={autoKey || "key"} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-blue-600">種類</div>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            {Object.entries(TYPE_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-blue-700">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4" />
            必須項目
          </label>
        </div>
      </div>
      {needsOptions && (
        <div className="space-y-1">
          <div className="text-xs text-blue-600">選択肢（カンマ区切り）</div>
          <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="例: A, B, C" className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">追加</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm text-blue-700 hover:bg-blue-100">キャンセル</button>
      </div>
    </form>
  );
}

// ── Main Editor ──
export default function EditorClient({ initialJson, hiddenName = "schema_json" }: { initialJson: string; hiddenName?: string }) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, schema: JSON.parse(initialJson) as Schema, error: "" };
    } catch (e: any) {
      return { ok: false as const, schema: { version: 1, sections: [] } as Schema, error: String(e?.message ?? e) };
    }
  }, [initialJson]);

  const [schema, setSchema] = useState<Schema>(parsed.schema);
  const hiddenRef = useRef<HTMLTextAreaElement | null>(null);
  const [addingSectionName, setAddingSectionName] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [addingFieldIdx, setAddingFieldIdx] = useState<number | null>(null);

  const dupKeys = useMemo(() => computeDupKeys(schema), [schema]);

  const sync = (next: Schema) => {
    setSchema(next);
    queueMicrotask(() => {
      if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(next, null, 2);
    });
  };

  const addSection = () => {
    if (!addingSectionName.trim()) return;
    sync({ ...schema, sections: [...schema.sections, { title: addingSectionName.trim(), fields: [] }] });
    setAddingSectionName("");
    setShowAddSection(false);
  };

  const updateSectionTitle = (sidx: number, title: string) => {
    const next = structuredClone(schema) as Schema;
    next.sections[sidx].title = title;
    sync(next);
  };

  const removeSection = (sidx: number) => {
    if (!confirm(`「${schema.sections[sidx].title}」セクションを削除しますか？`)) return;
    const next = structuredClone(schema) as Schema;
    next.sections.splice(sidx, 1);
    sync(next);
  };

  const moveSection = (sidx: number, dir: -1 | 1) => {
    const next = structuredClone(schema) as Schema;
    const j = sidx + dir;
    if (j < 0 || j >= next.sections.length) return;
    [next.sections[sidx], next.sections[j]] = [next.sections[j], next.sections[sidx]];
    sync(next);
  };

  const addField = (sidx: number, field: Field) => {
    const next = structuredClone(schema) as Schema;
    next.sections[sidx].fields.push(field);
    sync(next);
    setAddingFieldIdx(null);
  };

  const updateField = (sidx: number, fidx: number, patch: Partial<Field>) => {
    const next = structuredClone(schema) as Schema;
    const cur = next.sections[sidx].fields[fidx];
    const upd = { ...cur, ...patch };
    if (patch.type) {
      if (patch.type !== "select" && patch.type !== "multiselect") delete upd.options;
      else if (!upd.options) upd.options = [];
    }
    next.sections[sidx].fields[fidx] = upd;
    sync(next);
  };

  const removeField = (sidx: number, fidx: number) => {
    const f = schema.sections[sidx].fields[fidx];
    if (!confirm(`「${f.label}」を削除しますか？`)) return;
    const next = structuredClone(schema) as Schema;
    next.sections[sidx].fields.splice(fidx, 1);
    sync(next);
  };

  const moveField = (sidx: number, fidx: number, dir: -1 | 1) => {
    const next = structuredClone(schema) as Schema;
    const fields = next.sections[sidx].fields;
    const j = fidx + dir;
    if (j < 0 || j >= fields.length) return;
    [fields[fidx], fields[j]] = [fields[j], fields[fidx]];
    sync(next);
  };

  return (
    <div className="space-y-5">
      {!parsed.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          JSONの読み込みに失敗しました：{parsed.error}
        </div>
      )}

      {dupKeys.size > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          キーが重複しています（保存前に修正してください）：{" "}
          <span className="font-mono">{Array.from(dupKeys).join(", ")}</span>
        </div>
      )}

      <textarea ref={hiddenRef} name={hiddenName} defaultValue={JSON.stringify(schema, null, 2)} hidden />

      {schema.sections.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          セクションがありません。下の「セクションを追加」から作成してください。
        </div>
      )}

      {schema.sections.map((sec, sidx) => (
        <div key={sidx} className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="flex items-center gap-2 bg-neutral-50 px-4 py-3 border-b border-neutral-200">
            <input
              className="flex-1 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-400"
              value={sec.title}
              onChange={(e) => updateSectionTitle(sidx, e.target.value)}
              placeholder="セクション名"
            />
            <div className="flex gap-1">
              <button type="button" onClick={() => moveSection(sidx, -1)} disabled={sidx === 0} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-30" title="上に移動">↑ 上</button>
              <button type="button" onClick={() => moveSection(sidx, 1)} disabled={sidx === schema.sections.length - 1} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-30" title="下に移動">↓ 下</button>
              <button type="button" onClick={() => removeSection(sidx)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">削除</button>
            </div>
          </div>

          {/* Fields */}
          <div className="p-4 space-y-3">
            {sec.fields.length === 0 && <div className="text-sm text-neutral-400 py-2">項目なし</div>}

            {sec.fields.map((f, fidx) => {
              const k = (f.key ?? "").trim();
              const isDup = k && dupKeys.has(k);
              return (
                <div key={fidx} className={`rounded-xl border p-3 space-y-2.5 ${isDup ? "border-red-400 bg-red-50" : "border-neutral-200 bg-neutral-50"}`}>
                  {/* Field header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="shrink-0 text-[10px] font-semibold text-neutral-400">#{fidx + 1}</span>
                      <span className="text-sm font-medium text-neutral-900 truncate">{f.label || "(未設定)"}</span>
                      <span className="text-[10px] font-mono text-neutral-400">{f.key}</span>
                      {f.required && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">必須</span>}
                      {isDup && <span className="text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-medium">キー重複</span>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => moveField(sidx, fidx, -1)} disabled={fidx === 0} className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveField(sidx, fidx, 1)} disabled={fidx === sec.fields.length - 1} className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => removeField(sidx, fidx)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-500 hover:bg-red-50">削除</button>
                    </div>
                  </div>

                  {/* Inline edit */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-neutral-500">ラベル</div>
                      <input className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" value={f.label} onChange={(e) => updateField(sidx, fidx, { label: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-neutral-500">キー</div>
                      <input className={`w-full rounded-lg border bg-white px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400 ${isDup ? "border-red-400" : "border-neutral-300"}`} value={f.key} onChange={(e) => updateField(sidx, fidx, { key: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-neutral-500">種類</div>
                      <select className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" value={f.type} onChange={(e) => updateField(sidx, fidx, { type: e.target.value as FieldType })}>
                        {Object.entries(TYPE_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(sidx, fidx, { required: e.target.checked })} className="h-4 w-4 rounded border-neutral-300" />
                        必須
                      </label>
                    </div>
                  </div>

                  {(f.type === "select" || f.type === "multiselect") && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-neutral-500">選択肢（カンマ区切り）</div>
                      <input className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" value={(f.options ?? []).join(", ")} onChange={(e) => updateField(sidx, fidx, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="A, B, C" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add field */}
            {addingFieldIdx === sidx ? (
              <AddFieldForm onAdd={(f) => addField(sidx, f)} onCancel={() => setAddingFieldIdx(null)} />
            ) : (
              <button type="button" onClick={() => setAddingFieldIdx(sidx)} className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700">
                ＋ 項目を追加
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add Section */}
      {showAddSection ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div className="text-xs font-semibold text-emerald-700">新しいセクション</div>
          <div className="flex gap-2">
            <input value={addingSectionName} onChange={(e) => setAddingSectionName(e.target.value)} placeholder="セクション名（例: コーティング）" autoFocus onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection())} className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button type="button" onClick={addSection} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">追加</button>
            <button type="button" onClick={() => { setShowAddSection(false); setAddingSectionName(""); }} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100">キャンセル</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowAddSection(true)} className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700">
          ＋ セクションを追加
        </button>
      )}

      <div className="text-xs text-neutral-400 flex gap-4">
        <span>セクション: {schema.sections.length}</span>
        <span>項目数: {schema.sections.reduce((sum, s) => sum + s.fields.length, 0)}</span>
        <span>version: {schema.version}</span>
      </div>
    </div>
  );
}
