"use client";

import { useState } from "react";
import HelpTooltip from "@/components/ui/HelpTooltip";
import StaffNameField from "./StaffNameField";
import {
  WORK_TYPE_OPTIONS,
  FINDING_CATEGORY_OPTIONS,
  FINDING_SEVERITY_OPTIONS,
  PART_CATEGORY_LABELS,
  PART_CATEGORY_PRESETS,
} from "@/lib/maintenance/constants";

type MaintenanceData = {
  work_types: string[];
  mileage: string;
  parts_replaced: string;
  next_service_date: string;
  findings: string;
  mechanic_name: string;
};

type InspectionFinding = {
  finding_category: string;
  finding_severity: string;
  finding_note: string;
};

type PartReplacement = {
  part_category: string;
  part_name: string;
  next_replacement_mileage_est: string;
};

const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const selectCls =
  "rounded-lg border border-border-default bg-surface px-2 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const SEVERITY_COLORS: Record<string, string> = {
  ok: "bg-green-50 border-green-200 text-green-700",
  advisory: "bg-yellow-50 border-yellow-200 text-yellow-700",
  warning: "bg-orange-50 border-orange-200 text-orange-700",
  critical: "bg-red-50 border-red-200 text-red-700",
};

export default function MaintenanceDetailsSection() {
  const [data, setData] = useState<MaintenanceData>({
    work_types: [],
    mileage: "",
    parts_replaced: "",
    next_service_date: "",
    findings: "",
    mechanic_name: "",
  });

  const [findings, setFindings] = useState<InspectionFinding[]>([]);
  const [parts, setParts] = useState<PartReplacement[]>([]);

  const toggleWorkType = (value: string) => {
    setData((prev) => ({
      ...prev,
      work_types: prev.work_types.includes(value)
        ? prev.work_types.filter((v) => v !== value)
        : [...prev.work_types, value],
    }));
  };

  const update = (field: keyof MaintenanceData, value: string) => setData((prev) => ({ ...prev, [field]: value }));

  const addFinding = () =>
    setFindings((prev) => [...prev, { finding_category: "brake", finding_severity: "ok", finding_note: "" }]);

  const updateFinding = (i: number, field: keyof InspectionFinding, value: string) =>
    setFindings((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));

  const removeFinding = (i: number) => setFindings((prev) => prev.filter((_, idx) => idx !== i));

  const addPart = () =>
    setParts((prev) => [...prev, { part_category: "oil_filter", part_name: "", next_replacement_mileage_est: "" }]);

  const updatePart = (i: number, field: keyof PartReplacement, value: string) =>
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));

  const removePart = (i: number) => setParts((prev) => prev.filter((_, idx) => idx !== i));

  const jsonValue = JSON.stringify({
    work_types: data.work_types,
    mileage: data.mileage.trim() || null,
    parts_replaced: data.parts_replaced.trim() || null,
    next_service_date: data.next_service_date || null,
    findings: data.findings.trim() || null,
    mechanic_name: data.mechanic_name.trim() || null,
  });

  const findingsJson = JSON.stringify(
    findings
      .filter((f) => f.finding_category)
      .map((f) => ({
        finding_category: f.finding_category,
        finding_severity: f.finding_severity,
        finding_note: f.finding_note.trim() || null,
      })),
  );

  const partsJson = JSON.stringify(
    parts
      .filter((p) => p.part_name.trim())
      .map((p) => ({
        part_category: p.part_category,
        part_name: p.part_name.trim(),
        next_replacement_mileage_est: p.next_replacement_mileage_est
          ? parseInt(p.next_replacement_mileage_est, 10)
          : null,
      })),
  );

  return (
    <div className="space-y-4">
      <input type="hidden" name="maintenance_json" value={jsonValue} />
      <input type="hidden" name="inspection_findings_json" value={findingsJson} />
      <input type="hidden" name="part_replacements_json" value={partsJson} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">MAINTENANCE DETAILS</div>
        <div className="mt-0.5 text-base font-semibold text-primary flex items-center gap-1.5">
          整備内容
          <HelpTooltip>
            実施した整備項目 (オイル交換 / ブレーキパッド / 車検等)
            を選択。走行距離や交換部品も記録すると、次回整備時期の判定や保険査定で活用できます。
          </HelpTooltip>
        </div>
        <p className="mt-1 text-xs text-muted">実施した整備の内容を記録します。</p>
      </div>

      {/* 作業種別（複数選択） */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">作業種別（複数選択可）</label>
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
          <div className="mt-2 text-xs text-muted">{data.work_types.length} 項目を選択中</div>
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

      {/* 交換部品（自由テキスト） */}
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

      {/* 部品交換（構造化） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-secondary flex items-center gap-1.5">
            部品交換記録
            <HelpTooltip>
              カテゴリ別に記録すると、次回交換推奨距離との実績比較がAIモデルの学習データになります。
            </HelpTooltip>
          </span>
          <button
            type="button"
            onClick={addPart}
            className="text-xs text-accent hover:text-accent-text font-medium px-2 py-1 rounded border border-accent/30 bg-accent-dim/30 hover:bg-accent-dim transition-colors"
          >
            + 追加
          </button>
        </div>

        {parts.length > 0 && (
          <div className="space-y-2">
            {parts.map((part, i) => (
              <div
                key={i}
                className="flex gap-2 items-start rounded-lg border border-border-default bg-surface-subtle p-2"
              >
                <select
                  value={part.part_category}
                  onChange={(e) => updatePart(i, "part_category", e.target.value)}
                  className={selectCls}
                >
                  {PART_CATEGORY_PRESETS.map((cat) => (
                    <option key={cat} value={cat}>
                      {PART_CATEGORY_LABELS[cat] ?? cat}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={part.part_name}
                  onChange={(e) => updatePart(i, "part_name", e.target.value)}
                  placeholder="部品名（例: 5W-30 4L）"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="number"
                  value={part.next_replacement_mileage_est}
                  onChange={(e) => updatePart(i, "next_replacement_mileage_est", e.target.value)}
                  placeholder="次回推奨km"
                  className={`${inputCls} w-32`}
                />
                <button
                  type="button"
                  onClick={() => removePart(i)}
                  className="mt-1 text-muted hover:text-danger text-xs px-1"
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* 点検結果・所見（自由テキスト） */}
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

      {/* 点検所見（構造化） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-secondary flex items-center gap-1.5">
            点検所見
            <HelpTooltip>
              部位ごとの状態を記録します。「要注意」「警告」の所見が将来の故障予測AIのシグナルになります。
            </HelpTooltip>
          </span>
          <button
            type="button"
            onClick={addFinding}
            className="text-xs text-accent hover:text-accent-text font-medium px-2 py-1 rounded border border-accent/30 bg-accent-dim/30 hover:bg-accent-dim transition-colors"
          >
            + 追加
          </button>
        </div>

        {findings.length > 0 && (
          <div className="space-y-2">
            {findings.map((finding, i) => (
              <div
                key={i}
                className="flex gap-2 items-start rounded-lg border border-border-default bg-surface-subtle p-2"
              >
                <select
                  value={finding.finding_category}
                  onChange={(e) => updateFinding(i, "finding_category", e.target.value)}
                  className={selectCls}
                >
                  {FINDING_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={finding.finding_severity}
                  onChange={(e) => updateFinding(i, "finding_severity", e.target.value)}
                  className={`${selectCls} ${SEVERITY_COLORS[finding.finding_severity] ?? ""}`}
                >
                  {FINDING_SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={finding.finding_note}
                  onChange={(e) => updateFinding(i, "finding_note", e.target.value)}
                  placeholder="メモ（任意）"
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeFinding(i)}
                  className="mt-1 text-muted hover:text-danger text-xs px-1"
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 整備士名 (スタッフマスタから選択、マスタ未登録時は自由入力) */}
      <div className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">担当整備士</span>
        <StaffNameField
          value={data.mechanic_name}
          onChange={(v) => update("mechanic_name", v)}
          placeholder="整備士名を入力"
          inputCls={inputCls}
        />
      </div>
    </div>
  );
}
