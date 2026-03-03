"use client";

import { useMemo, useRef, useState } from "react";

type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";
type Field = { key: string; label: string; type: FieldType; options?: string[]; required?: boolean };
type Section = { title: string; fields: Field[] };
type Schema = { version: number; sections: Section[] };

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

  const dupKeys = useMemo(() => computeDupKeys(schema), [schema]);

  const sync = (next: Schema) => {
    setSchema(next);
    queueMicrotask(() => {
      if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(next, null, 2);
    });
  };

  const addSection = () => {
    const title = prompt("セクション名")?.trim();
    if (!title) return;
    sync({ ...schema, sections: [...schema.sections, { title, fields: [] }] });
  };

  const addField = (sidx: number) => {
    const label = prompt("項目名（表示）")?.trim();
    if (!label) return;
    const key = slugKey(prompt("キー（空なら自動）")?.trim() || label);
    const type = (prompt("type: text/textarea/number/date/select/multiselect/checkbox", "text")?.trim() || "text") as FieldType;
    const required = confirm("必須にしますか？");

    const field: Field = { key, label, type, required };
    if (type === "select" || type === "multiselect") {
      const raw = prompt("options（カンマ区切り）", "A,B,C") || "";
      field.options = raw.split(",").map((x) => x.trim()).filter(Boolean);
    }

    const next = structuredClone(schema) as Schema;
    next.sections[sidx].fields.push(field);
    sync(next);
  };

  const updateSectionTitle = (sidx: number, title: string) => {
    const next = structuredClone(schema) as Schema;
    next.sections[sidx].title = title;
    sync(next);
  };

  const removeSection = (sidx: number) => {
    if (!confirm("このセクションを削除しますか？")) return;
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
    if (!confirm("この項目を削除しますか？")) return;
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
    <div className="space-y-4">
      {!parsed.ok ? (
        <div className="border rounded p-3 text-sm text-red-600">
          初期JSONの読み込みに失敗しました：{parsed.error}
        </div>
      ) : null}

      {dupKeys.size > 0 ? (
        <div className="border rounded p-3 text-sm text-red-600">
          keyが重複しています（保存前に修正してください）：{" "}
          <span className="font-mono">{Array.from(dupKeys).join(", ")}</span>
        </div>
      ) : null}

      <div className="flex gap-2 flex-wrap items-center">
        <button type="button" className="border rounded px-3 py-2 text-sm" onClick={addSection}>＋ セクション追加</button>
        <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => sync({ ...schema, version: (schema.version || 1) + 1 })}>version +1</button>
        <span className="text-xs text-gray-500">sections: {schema.sections.length}</span>
      </div>

      <textarea ref={hiddenRef} name={hiddenName} defaultValue={JSON.stringify(schema, null, 2)} hidden />

      {schema.sections.length === 0 ? (
        <div className="border rounded p-4 text-sm text-gray-500">
          セクションがありません。上の「＋ セクション追加」から作成してください。
        </div>
      ) : null}

      {schema.sections.map((sec, sidx) => (
        <div key={sidx} className="border rounded p-4 space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <input className="border rounded px-3 py-2 text-sm flex-1 min-w-[240px]" value={sec.title} onChange={(e) => updateSectionTitle(sidx, e.target.value)} />
            <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => moveSection(sidx, -1)}>↑</button>
            <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => moveSection(sidx, 1)}>↓</button>
            <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => addField(sidx)}>＋項目</button>
            <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => removeSection(sidx)}>削除</button>
          </div>

          {sec.fields.length === 0 ? <div className="text-sm text-gray-500">項目なし</div> : null}

          {sec.fields.map((f, fidx) => {
            const k = (f.key ?? "").trim();
            const isDup = k && dupKeys.has(k);

            return (
              <div key={fidx} className={"border rounded p-3 space-y-2 " + (isDup ? "border-red-400" : "")}>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="text-xs text-gray-500">key</div>
                  <input
                    className={"border rounded px-2 py-1 text-xs font-mono w-56 " + (isDup ? "border-red-400" : "")}
                    value={f.key}
                    onChange={(e) => updateField(sidx, fidx, { key: e.target.value })}
                  />
                  {isDup ? <span className="text-xs text-red-600">重複</span> : null}
                  <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => moveField(sidx, fidx, -1)}>↑</button>
                  <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => moveField(sidx, fidx, 1)}>↓</button>
                  <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => removeField(sidx, fidx)}>削除</button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">label</div>
                    <input className="border rounded px-3 py-2 text-sm w-full" value={f.label} onChange={(e) => updateField(sidx, fidx, { label: e.target.value })} />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">type</div>
                    <select className="border rounded px-3 py-2 text-sm w-full" value={f.type} onChange={(e) => updateField(sidx, fidx, { type: e.target.value as FieldType })}>
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="number">number</option>
                      <option value="date">date</option>
                      <option value="select">select</option>
                      <option value="multiselect">multiselect</option>
                      <option value="checkbox">checkbox</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 items-center flex-wrap">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(sidx, fidx, { required: e.target.checked })} />
                    必須
                  </label>

                  {(f.type === "select" || f.type === "multiselect") ? (
                    <div className="flex-1 min-w-[260px]">
                      <div className="text-xs text-gray-500">options（カンマ区切り）</div>
                      <input
                        className="border rounded px-3 py-2 text-sm w-full"
                        value={(f.options ?? []).join(",")}
                        onChange={(e) => updateField(sidx, fidx, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}