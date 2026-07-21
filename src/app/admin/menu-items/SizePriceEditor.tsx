"use client";

import { VEHICLE_SIZE_TIERS } from "@/lib/menu/sizePricing";

/**
 * 品目マスタのサイズ別価格エディタ (作成/編集フォーム共通)。
 *
 * 軸を選ぶと、その軸の段ごとに税抜価格を入力するグリッドが出る。親が状態を持ち、
 * 値は文字列 (入力途中を許容)。空欄の段は「その段は提供しない」= 保存時に落ちる。
 *
 * - 車両サイズ: SS〜XL の固定6段 (vehicle_size_master と同一基準)。
 * - ホイールインチ: 14〜24 インチの固定行 (よく使う範囲)。埋めた段だけ保存される。
 */

// 車両サイズ段の目安 (入力者向けヒント)。
const VEHICLE_SIZE_HINT: Record<string, string> = {
  SS: "軽自動車",
  S: "コンパクト",
  M: "セダン・小型ミニバン",
  L: "ミニバン・SUV",
  LL: "大型ミニバン・大型SUV",
  XL: "輸入大型・特大",
};

const WHEEL_INCHES = ["14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"] as const;

export interface SizePriceEditorProps {
  axis: "" | "vehicle_size" | "wheel_size";
  onAxisChange: (axis: "" | "vehicle_size" | "wheel_size") => void;
  /** 段キー -> 入力文字列。 */
  prices: Record<string, string>;
  onPriceChange: (key: string, value: string) => void;
  idPrefix: string;
}

export default function SizePriceEditor({ axis, onAxisChange, prices, onPriceChange, idPrefix }: SizePriceEditorProps) {
  const rows: Array<{ key: string; label: string; hint?: string }> =
    axis === "vehicle_size"
      ? VEHICLE_SIZE_TIERS.map((t) => ({ key: t, label: t, hint: VEHICLE_SIZE_HINT[t] }))
      : axis === "wheel_size"
        ? WHEEL_INCHES.map((i) => ({ key: i, label: `${i} インチ` }))
        : [];

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <label className="block text-sm font-medium text-gray-700">サイズ別価格</label>
      <p className="mt-0.5 text-xs text-gray-500">
        コーティング等でサイズごとに価格が変わる場合に使います。軸を選ぶと段ごとの価格をまとめて入力できます
        (埋めた段だけ保存)。未使用なら「なし」のまま単一の提供価格を使います。
      </p>
      <select
        id={`${idPrefix}-size-axis`}
        value={axis}
        onChange={(e) => onAxisChange(e.target.value as SizePriceEditorProps["axis"])}
        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">なし (単一価格)</option>
        <option value="vehicle_size">車両サイズ別 (SS〜XL)</option>
        <option value="wheel_size">ホイールインチ別</option>
      </select>

      {rows.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm text-gray-700">
                {row.label}
                {row.hint && <span className="ml-1 text-xs text-gray-400">{row.hint}</span>}
              </span>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={prices[row.key] ?? ""}
                  onChange={(e) => onPriceChange(row.key, e.target.value)}
                  placeholder="—"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 pr-7 text-right text-sm"
                  aria-label={`${row.label} の税抜価格`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  円
                </span>
              </div>
            </div>
          ))}
          {axis === "wheel_size" && (
            <p className="col-span-full text-xs text-gray-500">
              ※
              ホイールのインチはLINEの自動概算では判別できないため、自動返信では「インチを教えてください」と聞き返す運用です
              (別途対応)。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
