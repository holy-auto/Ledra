"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { parseMileageKm } from "@/lib/maintenance/mileage";

/**
 * OdometerOcrButton
 * ------------------------------------------------------------
 * メーターを撮る → `/api/admin/inspection-records/ocr` (target=odometer) で読む
 * → 走行距離の入力欄へ**下書きとして**流し込む。
 *
 * 設計方針（既存の `InspectionOcrIntake` と同じ）:
 * - **確定は人が行う。** 読み取り値は入力欄に入るだけで、送信するのは人。
 *   OCR 由来だと分かる表示を出し、目視確認を促す。
 * - **読めなければ null。** API 側が「数字を創作しない」方針なので、ここでも
 *   埋めずに手入力へ倒す。OCR は補助であって必須経路にしない。
 * - **鮮明度を見せる。** confidence が低い / warnings（ブレ・反射・欠け）がある場合は
 *   撮り直しを促す。メーターは読めないと業務にならないので黙って通さない。
 */

/** これ未満は「読めたが自信なし」として、目視確認と撮り直しを促す。 */
const LOW_CONFIDENCE = 0.7;

type OcrResponse = {
  status?: "ok" | "skipped";
  notice?: string;
  message?: string;
  mileage_km?: number | null;
  confidence?: number | null;
  warnings?: string[] | null;
};

interface Props {
  disabled?: boolean;
  /** 読み取れた走行距離(km)を入力欄へ流し込む。 */
  onRead: (mileageKm: number) => void;
}

type Tone = "ok" | "warn" | "error";

export default function OdometerOcrButton({ disabled, onRead }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);

  const handle = async (file: File | null) => {
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("target", "odometer");
      const res = await fetch("/api/admin/inspection-records/ocr", { method: "POST", body: form });
      const j = await parseJsonSafe<OcrResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.status === "skipped") {
        setMsg({ tone: "warn", text: j?.notice ?? "AI 自動入力が停止中です。手入力してください。" });
        return;
      }

      const km = parseMileageKm(j?.mileage_km ?? null);
      const warnings = (j?.warnings ?? []).filter(Boolean);
      const confidence = typeof j?.confidence === "number" ? j.confidence : null;

      if (km === null) {
        // 読めなかった。ここで適当な値を入れないのが一番大事。
        setMsg({
          tone: "error",
          text: ["メーターの数字を読み取れませんでした。手入力するか、撮り直してください。", ...warnings].join(" / "),
        });
        return;
      }

      onRead(km);

      const shaky = confidence !== null && confidence < LOW_CONFIDENCE;
      if (shaky || warnings.length > 0) {
        setMsg({
          tone: "warn",
          text: [
            `${km.toLocaleString()} km と読みました。**数字が合っているか確認してください。**`,
            ...(shaky ? ["読み取りの確度が低めです（撮り直すとより確実です）"] : []),
            ...warnings,
          ].join(" / "),
        });
      } else {
        setMsg({ tone: "ok", text: `${km.toLocaleString()} km と読みました。数字が合っているか確認してください。` });
      }
    } catch (e) {
      setMsg({ tone: "error", text: "読み取りに失敗しました: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  const toneCls = msg?.tone === "ok" ? "text-secondary" : msg?.tone === "warn" ? "text-warning" : "text-danger";

  return (
    <div className="space-y-1.5">
      <label
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm text-secondary hover:border-border-strong ${
          disabled || busy ? "pointer-events-none opacity-50" : ""
        }`}
      >
        📷 {busy ? "読み取り中…" : "メーターを撮って入力"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            void handle(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>
      {msg && <p className={`text-xs ${toneCls}`}>{msg.text}</p>}
    </div>
  );
}
