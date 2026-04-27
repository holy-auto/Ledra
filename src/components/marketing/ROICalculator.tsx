"use client";

import { useMemo, useState } from "react";
import { LeadForm } from "./LeadForm";
import { track } from "@/lib/marketing/analytics";

/**
 * ROI simulator for施工店.
 *
 * Inputs:
 *  - monthlyCerts: 月間の施工証明書発行数
 *  - minutesPerCert: 紙・Excel運用で1件あたりにかかる事務時間（分）
 *  - hourlyRate: 担当者の時給（円）
 *  - annualReissueCost: 書類再発行/紛失対応の年間コスト（円）
 *
 * Output:
 *  - 年間節約時間・金額
 *  - Ledra 導入後の推定事務時間（3分/件 を標準とする）
 */

const DEFAULT_INPUTS = {
  monthlyCerts: 100,
  minutesPerCert: 15,
  hourlyRate: 2500,
  annualReissueCost: 100000,
};

const AFTER_MIN_PER_CERT = 3;

function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function formatHours(min: number): string {
  return `${Math.round(min / 60).toLocaleString("ja-JP")} 時間`;
}

export function ROICalculator() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [formOpen, setFormOpen] = useState(false);

  const result = useMemo(() => {
    const beforeMinYear = inputs.monthlyCerts * inputs.minutesPerCert * 12;
    const afterMinYear = inputs.monthlyCerts * AFTER_MIN_PER_CERT * 12;
    const savedMinYear = Math.max(0, beforeMinYear - afterMinYear);

    const laborSavingYen = Math.round((savedMinYear / 60) * inputs.hourlyRate);
    const reissueSavingYen = Math.round(inputs.annualReissueCost * 0.8);
    const totalSavingYen = laborSavingYen + reissueSavingYen;

    return {
      beforeMinYear,
      afterMinYear,
      savedMinYear,
      laborSavingYen,
      reissueSavingYen,
      totalSavingYen,
    };
  }, [inputs]);

  function update<K extends keyof typeof inputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  function onRequestReport() {
    track({
      name: "roi_calculated",
      props: {
        monthly_certs: inputs.monthlyCerts,
        hours_per_cert: inputs.minutesPerCert / 60,
        estimated_saving_yen: result.totalSavingYen,
      },
    });
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 md:p-8">
        <h3 className="text-[1.125rem] font-bold text-white">現状の数値を入力</h3>
        <p className="mt-2 text-xs text-white/80">
          おおよその値で問題ありません。推定値を自動で計算します。
        </p>

        <div className="mt-6 space-y-5">
          <NumberField
            label="月間の施工証明書発行数（件）"
            value={inputs.monthlyCerts}
            onChange={(v) => update("monthlyCerts", v)}
            step={10}
            min={0}
          />
          <NumberField
            label="1件あたりの事務時間（分）"
            hint="紙・Excel 管理で書類作成・送付・保管にかかっている時間"
            value={inputs.minutesPerCert}
            onChange={(v) => update("minutesPerCert", v)}
            step={1}
            min={0}
          />
          <NumberField
            label="担当者の時給相当（円）"
            value={inputs.hourlyRate}
            onChange={(v) => update("hourlyRate", v)}
            step={100}
            min={0}
          />
          <NumberField
            label="書類再発行・紛失対応の年間コスト（円）"
            hint="書類の紛失・再発行・問合せ対応で発生している人件費・郵送費の合計目安"
            value={inputs.annualReissueCost}
            onChange={(v) => update("annualReissueCost", v)}
            step={10000}
            min={0}
          />
        </div>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.06] to-white/[0.02] p-7 md:p-8">
        <h3 className="text-[1.125rem] font-bold text-white">Ledra 導入時の推定削減効果</h3>
        <p className="mt-2 text-xs text-white/80">
          Ledra 導入後の1件あたり事務時間を {AFTER_MIN_PER_CERT} 分と仮定して計算しています。
        </p>

        <div className="mt-6 space-y-4">
          <StatRow
            label="年間 節約時間"
            value={formatHours(result.savedMinYear)}
            sub={`導入前 ${formatHours(result.beforeMinYear)} → 導入後 ${formatHours(result.afterMinYear)}`}
          />
          <StatRow label="年間 人件費削減" value={formatYen(result.laborSavingYen)} />
          <StatRow label="年間 再発行/紛失対応削減" value={formatYen(result.reissueSavingYen)} />
          <div className="mt-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.08] p-5">
            <p className="text-xs font-medium text-blue-200">年間 総削減額（推定）</p>
            <p className="mt-1 text-3xl md:text-4xl font-bold text-white tracking-tight">
              {formatYen(result.totalSavingYen)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRequestReport}
          className="mt-7 w-full inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] transition-all"
        >
          詳細レポートを受け取る（無料）
        </button>
        <p className="mt-3 text-center text-[0.688rem] text-white/75">
          貴社データに基づく個別試算・現場ヒアリングも無料で承ります。
        </p>
      </div>

      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ROIレポートの送付申込"
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-10 md:pt-20"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0b111c] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-start justify-between p-6 border-b border-white/[0.06]">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-blue-300">
                  ROI 詳細レポート
                </p>
                <h4 className="mt-2 text-lg font-bold text-white leading-snug">
                  試算結果 {formatYen(result.totalSavingYen)} / 年 のレポートをお送りします
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-2 text-white/75 hover:bg-white/[0.06] hover:text-white"
                aria-label="閉じる"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <LeadForm
                source="roi"
                fields={{ phone: true, industry: true, locations: true, timing: true }}
                labels={{ submit: "レポートを受け取る" }}
                context={{
                  inputs,
                  result,
                }}
                success={{
                  title: "レポートを送信しました",
                  body: "ご登録のメールに詳細レポートをお送りしました。\n担当より現場ヒアリングのご提案も個別にご連絡いたします。",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/80">{label}</label>
      {hint && <p className="mt-1 text-[0.688rem] text-white/75 leading-relaxed">{hint}</p>}
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.currentTarget.value) || 0)}
        className="mt-2 w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
      />
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="text-xs text-white/80">{label}</p>
        {sub && <p className="mt-0.5 text-[0.688rem] text-white/70">{sub}</p>}
      </div>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  );
}
