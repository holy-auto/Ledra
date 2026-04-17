"use client";

import { useState } from "react";

type CoverageRow = {
  id: number;
  panel: string;       // preset code or "custom"
  customPanel: string; // free text when panel === "custom"
  coverage: "full" | "partial";
  partial_note: string;
};

// PPF施工パネルプリセット
const PPF_PANEL_PRESETS = [
  { code: "hood", label: "ボンネット" },
  { code: "front_bumper", label: "フロントバンパー" },
  { code: "rear_bumper", label: "リアバンパー" },
  { code: "front_fenders", label: "フロントフェンダー" },
  { code: "rear_fenders", label: "リアフェンダー/クォーター" },
  { code: "doors", label: "ドアパネル" },
  { code: "door_edges", label: "ドアエッジ" },
  { code: "door_cups", label: "ドアカップ" },
  { code: "rocker_panels", label: "ロッカーパネル/サイドステップ" },
  { code: "a_pillars", label: "Aピラー" },
  { code: "b_pillars", label: "Bピラー" },
  { code: "side_mirrors", label: "サイドミラー" },
  { code: "roof", label: "ルーフ" },
  { code: "trunk_lid", label: "トランク/リアゲート" },
  { code: "headlights", label: "ヘッドライト" },
  { code: "taillights", label: "テールライト" },
  { code: "fog_lights", label: "フォグランプ" },
  { code: "windshield", label: "フロントガラス" },
  { code: "luggage_area", label: "荷室リップ" },
  { code: "full_body", label: "フルボディ" },
  { code: "custom", label: "その他（手入力）" },
] as const;

// よく使うセットプリセット
const QUICK_SETS = [
  {
    label: "フロントセット",
    panels: ["front_bumper", "hood", "front_fenders", "side_mirrors", "a_pillars"],
  },
  {
    label: "フロントフル",
    panels: ["front_bumper", "hood", "front_fenders", "side_mirrors", "a_pillars", "headlights", "fog_lights", "door_edges", "door_cups"],
  },
  {
    label: "フルボディ",
    panels: ["full_body"],
  },
] as const;

const selectCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

let nextId = 1;
function newRow(): CoverageRow {
  return {
    id: nextId++,
    panel: "",
    customPanel: "",
    coverage: "full",
    partial_note: "",
  };
}

export default function PpfCoverageSection() {
  const [rows, setRows] = useState<CoverageRow[]>([newRow()]);

  const update = (id: number, field: keyof CoverageRow, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (id: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const applyQuickSet = (panelCodes: readonly string[]) => {
    const newRows = panelCodes.map((code) => ({
      id: nextId++,
      panel: code,
      customPanel: "",
      coverage: "full" as const,
      partial_note: "",
    }));
    setRows(newRows);
  };

  // 使用済みパネルを追跡（重複選択防止）
  const usedPanels = new Set(rows.map((r) => r.panel).filter((p) => p && p !== "custom"));

  const validRows = rows.filter((r) => {
    const panel = r.panel === "custom" ? r.customPanel.trim() : r.panel;
    return !!panel;
  });

  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      panel: r.panel === "custom" ? r.customPanel.trim() : r.panel,
      coverage: r.coverage,
      ...(r.coverage === "partial" && r.partial_note.trim()
        ? { partial_note: r.partial_note.trim() }
        : {}),
    }))
  );

  return (
    <div className="space-y-4">
      <input type="hidden" name="ppf_coverage_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          PPF COVERAGE
        </div>
        <div className="mt-0.5 text-base font-semibold text-primary">
          PPF施工範囲
        </div>
        <p className="mt-1 text-xs text-muted">
          施工したパネルを選択し、フル施工か部分施工かを指定してください。
        </p>
      </div>

      {/* クイック選択ボタン */}
      <div className="flex flex-wrap gap-2">
        {QUICK_SETS.map((qs) => (
          <button
            key={qs.label}
            type="button"
            onClick={() => applyQuickSet(qs.panels)}
            className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent/15 transition-colors"
          >
            {qs.label}
          </button>
        ))}
      </div>

      {/* ヘッダー行 */}
      <div className="hidden sm:grid sm:grid-cols-[2.5fr_1fr_2fr_auto] gap-2 px-1">
        <span className="text-[11px] font-semibold text-muted uppercase">パネル</span>
        <span className="text-[11px] font-semibold text-muted uppercase">施工範囲</span>
        <span className="text-[11px] font-semibold text-muted uppercase">備考</span>
        <span />
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-1 sm:grid-cols-[2.5fr_1fr_2fr_auto] gap-2 items-start rounded-xl border border-border-subtle bg-inset p-3 sm:p-0 sm:bg-transparent sm:border-0"
        >
          {/* パネル選択 */}
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">
              パネル
            </span>
            <select
              value={row.panel}
              onChange={(e) => update(row.id, "panel", e.target.value)}
              className={selectCls}
            >
              <option value="">パネルを選択</option>
              {PPF_PANEL_PRESETS.map((p) => (
                <option
                  key={p.code}
                  value={p.code}
                  disabled={p.code !== "custom" && p.code !== row.panel && usedPanels.has(p.code)}
                >
                  {p.label}
                  {p.code !== "custom" && p.code !== row.panel && usedPanels.has(p.code)
                    ? " (選択済)"
                    : ""}
                </option>
              ))}
            </select>
            {row.panel === "custom" && (
              <input
                value={row.customPanel}
                onChange={(e) => update(row.id, "customPanel", e.target.value)}
                placeholder="パネル名を入力"
                className={`${inputCls} mt-1`}
              />
            )}
          </div>

          {/* フル/パーシャル */}
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">
              施工範囲
            </span>
            <select
              value={row.coverage}
              onChange={(e) => update(row.id, "coverage", e.target.value)}
              className={selectCls}
            >
              <option value="full">フル</option>
              <option value="partial">部分</option>
            </select>
          </div>

          {/* 部分施工時の備考 */}
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">
              備考
            </span>
            <input
              value={row.partial_note}
              onChange={(e) => update(row.id, "partial_note", e.target.value)}
              placeholder={row.coverage === "partial" ? "例: 下部15cmのみ" : "任意"}
              disabled={row.coverage === "full"}
              className={`${inputCls} disabled:bg-surface-hover disabled:text-muted`}
            />
          </div>

          {/* 削除 */}
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            disabled={rows.length === 1}
            className="mt-1 self-center rounded-lg border border-border-default px-2 py-1.5 text-xs text-muted hover:border-red-200 hover:text-red-500 disabled:opacity-30 sm:mt-0"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-dashed border-border-default px-4 py-2 text-sm text-muted hover:border-border-strong hover:text-primary"
      >
        ＋ パネルを追加
      </button>

      {validRows.length > 0 && (
        <div className="rounded-xl border border-border-default bg-inset p-2.5 text-xs text-muted">
          {validRows.length} パネルを記録します
          （フル: {validRows.filter((r) => r.coverage === "full").length}、
          部分: {validRows.filter((r) => r.coverage === "partial").length}）
        </div>
      )}
    </div>
  );
}
