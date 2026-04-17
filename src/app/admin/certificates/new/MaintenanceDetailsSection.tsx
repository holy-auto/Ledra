"use client";

import { useState } from "react";
import { WORK_TYPE_OPTIONS } from "@/lib/maintenance/constants";

type MaintenanceData = {
  work_types: string[];
  mileage: string;
  parts_replaced: string;
  next_service_date: string;
  findings: string;
  mechanic_name: string;
};

const selectCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function MaintenanceDetailsSection() {
  const [data, setData] = useState<MaintenanceData>({
    work_types: [],
    mileage: "",
    parts_replaced: "",
    next_service_date: "",
    findings: "",
    mechanic_name: "",
  });

  const toggleWorkType = (value: string) => {
    setData((prev) => ({
      ...prev,
      work_types: prev.work_types.includes(value)
        ? prev.work_types.filter((v) => v !== value)
        : [...prev.work_types, value],
    }));
  };

  const update = (field: keyof MaintenanceData, value: string) =>
    setData((prev) => ({ ...prev, [field]: value }));

  const jsonValue = JSON.stringify({
    work_types: data.work_types,
    mileage: data.mileage.trim() || null,
    parts_replaced: data.parts_replaced.trim() || null,
    next_service_date: data.next_service_date || null,
    findings: data.findings.trim() || null,
    mechanic_name: data.mechanic_name.trim() || null,
  });

  return (
    <div className="space-y-4">
      <input type="hidden" name="maintenance_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          MAINTENANCE DETAILS
        </div>
        <div className="mt-0.5 text-base font-semibold text-primary">
          整備内容
        </div>
        <p className="mt-1 text-xs text-muted">
          実施した整備の内容を記録します。
        </p>
      </div>

      {/* 作業種別（複数選択） */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">
          作業種別（複数選択可）
        </label>
        <div className="flex flex-wrap gap-2">
          {WORK_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleWorkType(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                data.work_types.includes(opt.value)
                  ? "border-accent/30 bg-accent-dim text-accent-text"
                  : "border-border-default bg-surface text-secondary hover:border-border-strong"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data.work_types.length > 0 && (
          <div className="mt-2 text-xs text-muted">
            {data.work_types.length} 項目を選択中
          </div>
        )}
      </div>

      {/* 走行距離 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">走行距離（km）</span>
        <input
          type="number"
          value={data.mileage}
          onChange={(e) => update("mileage", e.target.value)}
          placeholder="例: 35000"
          className={inputCls}
        />
      </label>

      {/* 交換部品 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">交換部品</span>
        <textarea
          value={data.parts_replaced}
          onChange={(e) => update("parts_replaced", e.target.value)}
          placeholder="例: エンジンオイル 5W-30 4L、オイルフィルター、エアフィルター"
          rows={3}
          className={inputCls}
        />
      </label>

      {/* 次回点検日 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">次回点検日</span>
        <input
          type="date"
          value={data.next_service_date}
          onChange={(e) => update("next_service_date", e.target.value)}
          className={inputCls}
        />
      </label>

      {/* 点検結果・所見 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">点検結果・所見</span>
        <textarea
          value={data.findings}
          onChange={(e) => update("findings", e.target.value)}
          placeholder="点検で確認した事項、注意点、推奨事項などを記入してください"
          rows={4}
          className={inputCls}
        />
      </label>

      {/* 整備士名 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">担当整備士</span>
        <input
          value={data.mechanic_name}
          onChange={(e) => update("mechanic_name", e.target.value)}
          placeholder="整備士名を入力"
          className={inputCls}
        />
      </label>
    </div>
  );
}
