"use client";

import { useState } from "react";

type Row = {
  id: number;
  location: string;
  before_um: string;
  after_um: string;
  notes: string;
};

const LOCATION_PRESETS = [
  "ボンネット",
  "ルーフ",
  "右フロントフェンダー",
  "左フロントフェンダー",
  "右フロントドア",
  "左フロントドア",
  "右リアドア",
  "左リアドア",
  "右リアフェンダー",
  "左リアフェンダー",
  "トランク/リアゲート",
  "右サイドステップ",
  "左サイドステップ",
];

let nextId = 1;
function newRow(): Row {
  return { id: nextId++, location: "", before_um: "", after_um: "", notes: "" };
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

export default function FilmThicknessSection() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [open, setOpen] = useState(false);

  const update = (id: number, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  // Serialize non-empty rows to JSON
  const validRows = rows.filter((r) => r.location.trim() || r.before_um || r.after_um);
  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      location: r.location.trim(),
      before_um: r.before_um ? Number(r.before_um) : null,
      after_um: r.after_um ? Number(r.after_um) : null,
      notes: r.notes.trim(),
    }))
  );

  return (
    <div className="border-t border-neutral-100 pt-6">
      {/* Hidden input always present */}
      <input type="hidden" name="film_thickness_json" value={jsonValue} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
            FILM THICKNESS
          </div>
          <div className="mt-0.5 text-base font-semibold text-neutral-900">
            膜厚計測
            <span className="ml-2 text-xs font-normal text-neutral-500">任意</span>
          </div>
        </div>
        <span className="text-sm text-neutral-500">{open ? "▲ 閉じる" : "▼ 入力する"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-neutral-500">
            各部位の施工前後の膜厚（μm）を記録します。
          </p>

          {/* Header row */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 px-1">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">部位</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">施工前(μm)</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">施工後(μm)</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">備考</span>
            <span />
          </div>

          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 items-start rounded-xl border border-neutral-100 bg-neutral-50 p-3 sm:p-0 sm:bg-transparent sm:border-0">
              {/* Location */}
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">部位</span>
                <input
                  list={`loc-list-${row.id}`}
                  value={row.location}
                  onChange={(e) => update(row.id, "location", e.target.value)}
                  placeholder="ボンネット"
                  className={inputCls}
                />
                <datalist id={`loc-list-${row.id}`}>
                  {LOCATION_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              {/* Before */}
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">施工前(μm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={row.before_um}
                  onChange={(e) => update(row.id, "before_um", e.target.value)}
                  placeholder="例: 90"
                  className={inputCls}
                />
              </div>

              {/* After */}
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">施工後(μm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={row.after_um}
                  onChange={(e) => update(row.id, "after_um", e.target.value)}
                  placeholder="例: 110"
                  className={inputCls}
                />
              </div>

              {/* Notes */}
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">備考</span>
                <input
                  value={row.notes}
                  onChange={(e) => update(row.id, "notes", e.target.value)}
                  placeholder="備考（任意）"
                  className={inputCls}
                />
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length === 1}
                className="mt-1 self-center rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-500 hover:border-red-200 hover:text-red-500 disabled:opacity-30 sm:mt-0"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
          >
            ＋ 部位を追加
          </button>

          {validRows.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
              {validRows.length} 部位を記録します
            </div>
          )}
        </div>
      )}
    </div>
  );
}
