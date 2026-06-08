/**
 * 証明書写真の「自動品質監査」結果パネル (表示専用)。
 *
 * アップロード時に photo.auto_quality_check (opt-in) が付与する
 * certificates.meta.quality_check (source="auto") を、証明書詳細ページの
 * サイドに表示する。スコア・抜け漏れ・警告を提示するだけで、発行のブロックは
 * 行わない (人が発行前に確認するための注釈)。
 */

export type AutoQualityResult = {
  overall_status: "pass" | "warning" | "fail" | "pending";
  standard_level?: string | null;
  score: number;
  missing_photos: string[];
  missing_fields: string[];
  warnings: Array<{ level: "error" | "warning" | "info"; message: string }>;
  image_count: number;
  vision_checked?: boolean;
  checked_at?: string | null;
};

const STATUS_STYLE: Record<AutoQualityResult["overall_status"], { badge: string; label: string; icon: string }> = {
  pass: { badge: "bg-emerald-400/10 text-emerald-500 border-emerald-400/30", label: "基準クリア", icon: "✅" },
  warning: { badge: "bg-warning-dim text-warning border-warning/30", label: "要確認", icon: "⚠️" },
  fail: { badge: "bg-red-400/10 text-red-400 border-red-400/30", label: "基準未達", icon: "❌" },
  pending: { badge: "bg-surface-hover text-muted border-border-default", label: "未判定", icon: "○" },
};

export default function QualityAutoPanel({ result }: { result: AutoQualityResult }) {
  const style = STATUS_STYLE[result.overall_status] ?? STATUS_STYLE.pending;
  const errors = result.warnings.filter((w) => w.level === "error");
  const warns = result.warnings.filter((w) => w.level === "warning");

  return (
    <section className="rounded-2xl border border-border-default bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">LEDRA STANDARD</div>
          <div className="text-base font-semibold text-primary">写真品質・抜け漏れ監査</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${style.badge}`}>
          {style.icon} {result.score}/100
        </span>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-sm ${style.badge}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">自動審査: {style.label}</span>
          {result.checked_at && (
            <span className="text-[11px] opacity-70">{new Date(result.checked_at).toLocaleString("ja-JP")}</span>
          )}
        </div>
        <p className="mt-1 text-xs opacity-80">
          アップロード時に自動付与
          {result.vision_checked ? "（AI 視覚審査を含む）" : "（ルールベース）"}。発行前にご確認ください。
        </p>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-400">❌ 必須修正</p>
          {errors.map((w, i) => (
            <div key={i} className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {w.message}
            </div>
          ))}
        </div>
      )}

      {warns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-warning">⚠️ 推奨修正</p>
          {warns.map((w, i) => (
            <div key={i} className="rounded-lg border border-warning/30 bg-warning-dim px-3 py-2 text-xs text-warning">
              {w.message}
            </div>
          ))}
        </div>
      )}

      {result.missing_photos.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-secondary">📷 不足写真</p>
          <div className="flex flex-wrap gap-1.5">
            {result.missing_photos.map((p, i) => (
              <span
                key={i}
                className="rounded-full border border-warning/20 bg-warning-dim px-2.5 py-0.5 text-[11px] text-warning"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.missing_fields.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-secondary">📝 未入力項目</p>
          <div className="flex flex-wrap gap-1.5">
            {result.missing_fields.map((f, i) => (
              <span
                key={i}
                className="rounded-full border border-warning/20 bg-warning-dim px-2.5 py-0.5 text-[11px] text-warning"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.overall_status === "pass" && errors.length === 0 && warns.length === 0 && (
        <div className="rounded-lg border border-success/30 bg-success-dim px-3 py-2 text-xs text-success">
          ✅ Ledra Standard 基準をクリアしています。
        </div>
      )}
    </section>
  );
}
