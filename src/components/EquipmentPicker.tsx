"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------- types ---------- */
interface EquipmentPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

type EquipmentItem = { name: string; isCustom: boolean };
type EquipmentMap = Record<string, EquipmentItem[]>;

const CATEGORY_LABELS: Record<string, string> = {
  safety: "安全装備",
  comfort: "快適装備",
  entertainment: "AV・ナビ",
  exterior: "外装",
  interior: "内装",
};

const CATEGORY_ORDER = ["safety", "comfort", "entertainment", "exterior", "interior"];

/* ---------- component ---------- */
export default function EquipmentPicker({ selected, onChange }: EquipmentPickerProps) {
  const [equipment, setEquipment] = useState<EquipmentMap>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("safety");
  const [customInput, setCustomInput] = useState("");
  const [customCategory, setCustomCategory] = useState("safety");
  const csvInputRef = useRef<HTMLInputElement>(null);

  /* fetch equipment master */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/equipment-master");
        const j = await res.json();
        if (res.ok && j.equipment) {
          setEquipment(j.equipment);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* toggle item */
  const toggle = useCallback(
    (name: string) => {
      onChange(
        selected.includes(name)
          ? selected.filter((s) => s !== name)
          : [...selected, name],
      );
    },
    [selected, onChange],
  );

  /* count selected in category */
  const countInCategory = (cat: string): number => {
    const items = equipment[cat] ?? [];
    return items.filter((i) => selected.includes(i.name)).length;
  };

  /* add custom item */
  const handleAddCustom = async () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    // Add to selection immediately
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }

    // Persist to master (fire-and-forget)
    try {
      const res = await fetch("/api/admin/equipment-master", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: customCategory, name: trimmed }),
      });
      if (res.ok) {
        // Refresh equipment list
        const refresh = await fetch("/api/admin/equipment-master");
        const j = await refresh.json();
        if (refresh.ok && j.equipment) setEquipment(j.equipment);
      }
    } catch {
      /* ignore - already added to selection */
    }

    setCustomInput("");
  };

  /* CSV import */
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;

      // Parse: support one-per-line or comma-separated
      const items = text
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "装備名" && s !== "name"); // skip headers

      const newSelected = [...selected];
      for (const item of items) {
        if (!newSelected.includes(item)) {
          newSelected.push(item);
        }
      }
      onChange(newSelected);
    };
    reader.readAsText(file, "UTF-8");

    // Reset input so same file can be re-imported
    e.target.value = "";
  };

  /* sorted categories from equipment keys, maintaining canonical order */
  const categories = CATEGORY_ORDER.filter((c) => c in equipment);
  // Add any extra categories not in canonical order
  for (const k of Object.keys(equipment)) {
    if (!categories.includes(k)) categories.push(k);
  }

  if (loading) {
    return (
      <div className="text-sm text-muted py-4">装備マスタを読み込み中...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const count = countInCategory(cat);
          const isActive = activeTab === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "bg-surface-hover text-secondary hover:bg-border-default"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
              {count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-white/25 text-white"
                      : "bg-accent/15 text-accent"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Equipment buttons for active category */}
      <div className="flex flex-wrap gap-2">
        {(equipment[activeTab] ?? []).map((item) => {
          const isSelected = selected.includes(item.name);
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => toggle(item.name)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? "border-accent bg-accent/10 text-accent shadow-sm"
                  : "border-border-subtle bg-surface text-secondary hover:border-border-default hover:bg-surface-hover"
              }`}
            >
              {isSelected && (
                <svg
                  className="mr-1 inline-block h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {item.name}
            </button>
          );
        })}
      </div>

      {/* Selected items from other categories (not in master) */}
      {(() => {
        const allMasterNames = new Set(
          Object.values(equipment).flatMap((items) => items.map((i) => i.name)),
        );
        const customSelected = selected.filter((s) => !allMasterNames.has(s));
        if (customSelected.length === 0) return null;
        return (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-muted tracking-wider">
              カスタム装備
            </div>
            <div className="flex flex-wrap gap-2">
              {customSelected.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent shadow-sm transition-all"
                >
                  <svg
                    className="mr-1 inline-block h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {name}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Summary */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-accent">{selected.length}</span>
          件選択中
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-auto text-[10px] text-muted hover:text-danger transition-colors"
          >
            全解除
          </button>
        </div>
      )}

      {/* Add custom + CSV import */}
      <div className="rounded-lg border border-border-subtle bg-surface-hover p-3 space-y-3">
        <div className="text-[10px] font-semibold text-muted tracking-wider">
          カスタム装備を追加
        </div>
        <div className="flex gap-2">
          <select
            className="select-field text-xs flex-shrink-0"
            style={{ width: "auto", minWidth: "100px" }}
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
          >
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input-field text-xs flex-1"
            placeholder="装備名を入力"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary text-xs flex-shrink-0"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
          >
            追加
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => csvInputRef.current?.click()}
          >
            <svg
              className="mr-1 inline-block h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            CSVインポート
          </button>
          <span className="text-[10px] text-muted">
            カンマ区切り or 1行1装備のCSVファイル
          </span>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>
      </div>
    </div>
  );
}
