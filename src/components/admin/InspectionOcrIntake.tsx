"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { planInspectionOcrIntake, type InspectionOcrPayload, type OcrIntakeItem } from "@/lib/inspection/ocrIntake";

/**
 * InspectionOcrIntake
 * ------------------------------------------------------------
 * 走行距離メーター / タイヤの写真を撮る → OCR (`/api/admin/inspection-records/ocr`)
 * → 対応する numeric 項目へ流し込み、所見は特記事項へ追記する。
 *
 * 証明書フォームの「膜厚計から取り込み」(FilmThicknessSection) と同じ、カメラ直行 +
 * 取り込みボタンのパターン。読み取り値は下書き扱いで、確定 (保存) は人が行う。
 */

type OcrResponse = InspectionOcrPayload & { status?: "ok" | "skipped"; notice?: string; message?: string };

interface Props {
  /** ラベル一致で流し込み先を探すためのテンプレート項目。 */
  items: OcrIntakeItem[];
  disabled?: boolean;
  /** numeric 項目へ値を入れる。 */
  onFillNumeric: (itemId: string, value: string) => void;
  /** 特記事項へ行を追記する。 */
  onAppendNote: (text: string) => void;
}

const TARGETS: { key: "odometer" | "tire"; label: string; busyLabel: string }[] = [
  { key: "odometer", label: "走行距離を撮影", busyLabel: "読み取り中…" },
  { key: "tire", label: "タイヤ残溝を撮影", busyLabel: "読み取り中…" },
];

export default function InspectionOcrIntake({ items, disabled, onFillNumeric, onAppendNote }: Props) {
  const [busy, setBusy] = useState<"odometer" | "tire" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const handle = async (target: "odometer" | "tire", file: File | null) => {
    if (!file) return;
    setMsg(null);
    setBusy(target);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("target", target);
      const res = await fetch("/api/admin/inspection-records/ocr", { method: "POST", body: form });
      const j = await parseJsonSafe<OcrResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.status === "skipped") {
        setMsg(j?.notice ?? "AI 自動入力が停止中のため、手動で入力してください。");
        return;
      }
      if (!j) throw new Error("応答が空です");

      const plan = planInspectionOcrIntake(
        {
          target,
          mileage_km: j.mileage_km ?? null,
          tread_depth_mm: j.tread_depth_mm ?? null,
          slip_sign_exposed: j.slip_sign_exposed ?? null,
          condition_notes: Array.isArray(j.condition_notes) ? j.condition_notes : [],
          warnings: Array.isArray(j.warnings) ? j.warnings : [],
          tire_advice: j.tire_advice ?? null,
        },
        items,
      );
      if (plan.fill) onFillNumeric(plan.fill.itemId, plan.fill.value);
      if (plan.noteLines.length > 0) onAppendNote(plan.noteLines.join("\n"));
      setMsg(plan.message);
    } catch (e) {
      setMsg("読み取りに失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {TARGETS.map((t) => {
          const isBusy = busy === t.key;
          return (
            <label
              key={t.key}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm text-secondary hover:border-border-strong ${
                disabled || busy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              📷 {isBusy ? t.busyLabel : t.label}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                disabled={disabled || !!busy}
                onChange={(e) => {
                  void handle(t.key, e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          );
        })}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
