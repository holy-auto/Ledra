"use client";

import { useState } from "react";
import {
  REPAIR_TYPE_OPTIONS,
  REPAIR_PANEL_OPTIONS,
  PAINT_TYPE_OPTIONS,
  REPAIR_METHOD_OPTIONS,
} from "@/lib/bodyRepair/constants";

type BodyRepairData = {
  repair_type: string;
  affected_panels: string[];
  paint_color_code: string;
  paint_type: string;
  repair_methods: string[];
  warranty_info: string;
  before_notes: string;
  after_notes: string;
};

const selectCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function BodyRepairDetailsSection() {
  const [data, setData] = useState<BodyRepairData>({
    repair_type: "",
    affected_panels: [],
    paint_color_code: "",
    paint_type: "",
    repair_methods: [],
    warranty_info: "",
    before_notes: "",
    after_notes: "",
  });

  const togglePanel = (value: string) => {
    setData((prev) => ({
      ...prev,
      affected_panels: prev.affected_panels.includes(value)
        ? prev.affected_panels.filter((v) => v !== value)
        : [...prev.affected_panels, value],
    }));
  };

  const toggleRepairMethod = (value: string) => {
    setData((prev) => ({
      ...prev,
      repair_methods: prev.repair_methods.includes(value)
        ? prev.repair_methods.filter((v) => v !== value)
        : [...prev.repair_methods, value],
    }));
  };

  const update = (field: keyof BodyRepairData, value: string) =>
    setData((prev) => ({ ...prev, [field]: value }));

  const jsonValue = JSON.stringify({
    repair_type: data.repair_type || null,
    affected_panels: data.affected_panels,
    paint_color_code: data.paint_color_code.trim() || null,
    paint_type: data.paint_type || null,
    repair_methods: data.repair_methods,
    warranty_info: data.warranty_info.trim() || null,
    before_notes: data.before_notes.trim() || null,
    after_notes: data.after_notes.trim() || null,
  });

  return (
    <div className="space-y-4">
      <input type="hidden" name="body_repair_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          BODY REPAIR DETAILS
        </div>
        <div className="mt-0.5 text-base font-semibold text-primary">
          鈑金塗装内容
        </div>
        <p className="mt-1 text-xs text-muted">
          実施した鈑金・塗装の内容を記録します。
        </p>
      </div>

      {/* 修理種別 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">修理種別</span>
        <select
          value={data.repair_type}
          onChange={(e) => update("repair_type", e.target.value)}
          className={selectCls}
        >
          <option value="">選択してください</option>
          {REPAIR_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 修理箇所（複数選択） */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">
          修理箇所（複数選択可）
        </label>
        <div className="flex flex-wrap gap-2">
          {REPAIR_PANEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePanel(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                data.affected_panels.includes(opt.value)
                  ? "border-accent/30 bg-accent-dim text-accent-text"
                  : "border-border-default bg-surface text-secondary hover:border-border-strong"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data.affected_panels.length > 0 && (
          <div className="mt-2 text-xs text-muted">
            {data.affected_panels.length} 箇所を選択中
          </div>
        )}
      </div>

      {/* 塗装色・カラーコード */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">塗装色・カラーコード</span>
        <input
          value={data.paint_color_code}
          onChange={(e) => update("paint_color_code", e.target.value)}
          placeholder="例: パールホワイト (070)"
          className={inputCls}
        />
      </label>

      {/* 塗装タイプ */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">塗装タイプ</span>
        <select
          value={data.paint_type}
          onChange={(e) => update("paint_type", e.target.value)}
          className={selectCls}
        >
          <option value="">選択してください</option>
          {PAINT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 修理方法（複数選択） */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">
          修理方法（複数選択可）
        </label>
        <div className="flex flex-wrap gap-2">
          {REPAIR_METHOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleRepairMethod(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                data.repair_methods.includes(opt.value)
                  ? "border-accent/30 bg-accent-dim text-accent-text"
                  : "border-border-default bg-surface text-secondary hover:border-border-strong"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data.repair_methods.length > 0 && (
          <div className="mt-2 text-xs text-muted">
            {data.repair_methods.length} 方法を選択中
          </div>
        )}
      </div>

      {/* 保証情報 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">修理保証情報</span>
        <textarea
          value={data.warranty_info}
          onChange={(e) => update("warranty_info", e.target.value)}
          placeholder="例: 塗装保証1年（通常使用に限る）"
          rows={2}
          className={inputCls}
        />
      </label>

      {/* 修理前の状態 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">修理前の状態・備考</span>
        <textarea
          value={data.before_notes}
          onChange={(e) => update("before_notes", e.target.value)}
          placeholder="修理前の損傷状態を記入してください"
          rows={3}
          className={inputCls}
        />
      </label>

      {/* 修理後の状態 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">修理後の状態・備考</span>
        <textarea
          value={data.after_notes}
          onChange={(e) => update("after_notes", e.target.value)}
          placeholder="修理後の仕上がり、注意点などを記入してください"
          rows={3}
          className={inputCls}
        />
      </label>
    </div>
  );
}
