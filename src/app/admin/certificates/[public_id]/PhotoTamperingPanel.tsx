"use client";

/**
 * 写真改ざん検出パネル。
 * ボタンをクリックすると /api/admin/certificates/photo-tampering を呼び出し、
 * EXIF + Vision ハイブリッド審査の結果を表示する。
 */

import { useState } from "react";

type PhotoResult = {
  photo_index: number;
  verdict: "clear" | "suspicious" | "inconclusive";
  flags: string[];
  taken_at: string | null;
  device: string | null;
  software: string | null;
  gps: { lat: number; lng: number } | null;
  vision_reason: string | null;
};

type AuditResult = {
  any_flagged: boolean;
  summary: string;
  results: PhotoResult[];
};

const FLAG_LABELS: Record<string, string> = {
  software_edited: "編集ソフトの痕跡",
  timestamp_future: "撮影日時が未来",
  timestamp_mismatch: "タイムスタンプ不一致",
  duplicate_hash: "重複写真",
  gps_extreme: "GPS 異常値",
  exif_stripped: "EXIF 欠落",
  vision_suspicious: "AI 視覚審査で疑わしい",
  // 自動スクリーニング (certificatePhotoIntegrity) のフラグ
  duplicate_image: "写真の重複",
  similar_image: "類似写真 (使い回し疑い)",
  deepfake_suspected: "ディープフェイク疑い",
  capture_time_future: "撮影日時が未来",
  capture_time_stale: "撮影がアップロードより大幅に前 (使い回し疑い)",
  metadata_missing: "撮影メタ欠落",
  gps_mismatch_store: "撮影場所が店舗から離れている (出張なら正当)",
  c2pa_missing: "C2PA署名の欠落",
  external_c2pa_invalid: "外部C2PA署名が無効 (撮影後改変の疑い)",
};

/** アップロード時に自動付与される改ざんスクリーニング結果 (certificates.meta.tampering_check)。 */
export type AutoTamperingResult = {
  verdict: "clear" | "suspicious" | "inconclusive";
  summary: string;
  flagged_count: number;
  image_count: number;
  flags: string[];
  vision_checked?: boolean;
  checked_at?: string | null;
};

const VERDICT_STYLE: Record<PhotoResult["verdict"], { badge: string; label: string }> = {
  clear: { badge: "bg-emerald-400/10 text-emerald-500 border-emerald-400/30", label: "正常" },
  suspicious: { badge: "bg-red-400/10 text-red-400 border-red-400/30", label: "要注意" },
  inconclusive: { badge: "bg-warning-dim text-warning border-warning/30", label: "判定不能" },
};

export default function PhotoTamperingPanel({
  certificateId,
  photoUrls,
  autoResult,
}: {
  certificateId: string;
  photoUrls: string[];
  autoResult?: AutoTamperingResult | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (photoUrls.length === 0) return null;

  async function runCheck() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/certificates/photo-tampering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificate_id: certificateId, photo_urls: photoUrls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "審査に失敗しました");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">EXIF + AI VISION</div>
          <div className="text-base font-semibold text-primary">写真改ざん検出</div>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
              審査中…
            </span>
          ) : (
            "改ざん審査を実行"
          )}
        </button>
      </div>

      {autoResult && (
        <div className={`rounded-xl border px-4 py-3 ${VERDICT_STYLE[autoResult.verdict].badge}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {autoResult.verdict === "suspicious" ? "⚠️ " : autoResult.verdict === "clear" ? "✅ " : ""}
              自動審査: {VERDICT_STYLE[autoResult.verdict].label}
            </span>
            {autoResult.checked_at && (
              <span className="text-[11px] opacity-70">{new Date(autoResult.checked_at).toLocaleString("ja-JP")}</span>
            )}
          </div>
          <p className="mt-1 text-xs">
            {autoResult.summary}
            {autoResult.image_count > 0 ? `（${autoResult.image_count} 枚）` : ""}
          </p>
          {autoResult.flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {autoResult.flags.map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-warning-dim border border-warning/30 px-2 py-0.5 text-[11px] text-warning"
                >
                  {FLAG_LABELS[f] ?? f}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] opacity-70">
            アップロード時に自動付与{autoResult.vision_checked ? "（AI 視覚審査を含む）" : ""}。発行前にご確認ください。
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          {/* サマリ */}
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              result.any_flagged
                ? "border-red-400/30 bg-red-400/10 text-red-400"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-500"
            }`}
          >
            {result.any_flagged ? "⚠️ " : "✅ "}
            {result.summary}
          </div>

          {/* 写真ごとの結果 */}
          <div className="space-y-2">
            {result.results.map((r) => {
              const style = VERDICT_STYLE[r.verdict];
              return (
                <div key={r.photo_index} className="rounded-xl border border-border-default bg-surface-hover px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium text-primary">写真 {r.photo_index + 1}</div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>

                  {r.flags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.flags.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-warning-dim border border-warning/30 px-2 py-0.5 text-[11px] text-warning"
                        >
                          {FLAG_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted">
                    {r.taken_at && <span>撮影: {new Date(r.taken_at).toLocaleString("ja-JP")}</span>}
                    {r.device && <span>端末: {r.device}</span>}
                    {r.software && <span>ソフト: {r.software}</span>}
                    {r.gps && (
                      <span>
                        GPS: {r.gps.lat.toFixed(4)}, {r.gps.lng.toFixed(4)}
                      </span>
                    )}
                  </div>

                  {r.vision_reason && <p className="mt-2 text-xs text-red-400">{r.vision_reason}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
