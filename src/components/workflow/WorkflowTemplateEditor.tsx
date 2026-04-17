"use client";

import { useState } from "react";

export type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

type Props = {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
};

function generateKey(label: string, index: number): string {
  return `step_${index + 1}_${label.replace(/[^a-zA-Z0-9\u3040-\u9fff]/g, "").slice(0, 8)}`;
}

export default function WorkflowTemplateEditor({ steps, onChange }: Props) {
  const [newLabel, setNewLabel] = useState("");

  const updateStep = (index: number, field: keyof WorkflowStep, value: unknown) => {
    const updated = steps.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(updated);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...steps];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const moveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const updated = [...steps];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
    onChange(updated);
  };

  const addStep = () => {
    const label = newLabel.trim();
    if (!label) return;
    const index = steps.length;
    const newStep: WorkflowStep = {
      order: index + 1,
      key: generateKey(label, index),
      label,
      is_customer_visible: true,
      estimated_min: 15,
    };
    onChange([...steps, newStep]);
    setNewLabel("");
  };

  const totalMin = steps.reduce((sum, s) => sum + (s.estimated_min || 0), 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  return (
    <div className="space-y-3">
      {/* ステップ一覧 */}
      {steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default p-6 text-center text-sm text-muted">
          ステップを追加してください
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.key} className="rounded-xl border border-border-default bg-surface p-3">
              <div className="flex items-start gap-2">
                {/* 順序バッジ */}
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-dim text-[11px] font-bold text-accent-text">
                  {i + 1}
                </div>

                <div className="flex-1 space-y-2 min-w-0">
                  {/* ラベル */}
                  <input
                    type="text"
                    value={step.label}
                    onChange={(e) => updateStep(i, "label", e.target.value)}
                    className="w-full rounded-lg border border-border-default bg-inset px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="ステップ名"
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    {/* 推定時間 */}
                    <label className="flex items-center gap-1.5 text-xs text-secondary">
                      <span>目安</span>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={step.estimated_min}
                        onChange={(e) => updateStep(i, "estimated_min", parseInt(e.target.value, 10) || 0)}
                        className="w-16 rounded-lg border border-border-default bg-inset px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span>分</span>
                    </label>

                    {/* 顧客表示フラグ */}
                    <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={step.is_customer_visible}
                        onChange={(e) => updateStep(i, "is_customer_visible", e.target.checked)}
                        className="rounded border-border-default text-accent focus:ring-accent"
                      />
                      <span>📱 顧客に通知</span>
                    </label>
                  </div>
                </div>

                {/* 操作ボタン */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="rounded p-1 text-muted hover:bg-surface-hover hover:text-secondary disabled:opacity-30"
                    title="上へ"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path
                        fillRule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === steps.length - 1}
                    className="rounded p-1 text-muted hover:bg-surface-hover hover:text-secondary disabled:opacity-30"
                    title="下へ"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="rounded p-1 text-muted hover:bg-danger-dim hover:text-danger"
                    title="削除"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ステップ追加 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStep())}
          className="flex-1 rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="新しいステップ名を入力..."
        />
        <button
          type="button"
          onClick={addStep}
          disabled={!newLabel.trim()}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          追加
        </button>
      </div>

      {/* 合計時間 */}
      {steps.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-inset px-3 py-2 text-xs text-muted">
          <span>
            {steps.length}ステップ · 顧客通知 {steps.filter((s) => s.is_customer_visible).length}件
          </span>
          <span>
            合計目安: {totalH > 0 ? `${totalH}時間` : ""}
            {totalM > 0 ? `${totalM}分` : totalH === 0 ? "0分" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
