"use client";

import { useEffect, useState } from "react";
import { QUALITY_FLAG_LABELS, QUALITY_FLAG_DESCRIPTIONS, type QualityFlagCode } from "@/lib/manufacturers/qualityFlags";

type Flagged = {
  public_id: string;
  created_at: string;
  tenant_id: string | null;
  tenant_name: string | null;
  template_name: string | null;
  flags: QualityFlagCode[];
};

type Data = {
  scanned: number;
  scan_limit: number;
  summary: Record<QualityFlagCode, number>;
  flagged: Flagged[];
};

const FLAG_ORDER: QualityFlagCode[] = ["no_photos", "no_warranty", "no_service_detail", "no_customer_name"];

export default function QualityClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFlag, setActiveFlag] = useState<QualityFlagCode | "">("");

  const load = async (flag: QualityFlagCode | "") => {
    setLoading(true);
    setErr(null);
    try {
      const qs = flag ? `?flag=${flag}` : "";
      const res = await fetch(`/api/manufacturer/quality${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "読み込みに失敗しました。");
      setData(json as Data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(activeFlag);
  }, [activeFlag]);

  if (err) {
    return (
      <div className="rounded-md border border-danger-border bg-danger-dim p-3 text-sm text-danger-text">{err}</div>
    );
  }
  if (!data && loading) {
    return <div className="text-sm text-secondary">スキャン中...</div>;
  }
  if (!data) return null;

  const totalFlagged = data.flagged.length;

  return (
    <div className="space-y-6">
      {/* Summary cards — click to filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-4">
        {FLAG_ORDER.map((code) => {
          const count = data.summary[code] ?? 0;
          const isActive = activeFlag === code;
          return (
            <button
              key={code}
              onClick={() => setActiveFlag(isActive ? "" : code)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                isActive ? "border-accent bg-accent-dim" : "border-border-subtle bg-surface hover:bg-surface-hover"
              }`}
            >
              <div className="text-xs font-medium text-secondary">{QUALITY_FLAG_LABELS[code]}</div>
              <div className={`mt-1 text-2xl font-bold ${count > 0 ? "text-danger-text" : "text-primary"}`}>
                {count.toLocaleString("ja-JP")}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-muted">{QUALITY_FLAG_DESCRIPTIONS[code]}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          直近 {data.scanned.toLocaleString("ja-JP")} 件をスキャン（最大 {data.scan_limit.toLocaleString("ja-JP")} 件）
          {activeFlag && ` ／ フィルタ: ${QUALITY_FLAG_LABELS[activeFlag]}`}
        </span>
        {activeFlag && (
          <button onClick={() => setActiveFlag("")} className="text-accent hover:underline">
            フィルタ解除
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : totalFlagged === 0 ? (
        <div className="rounded-2xl border border-success-border bg-success-dim p-8 text-center text-sm text-success-text">
          {activeFlag
            ? "このフラグに該当する証明書はありません。"
            : "品質フラグに該当する証明書はありません。基準を満たしています。"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
          <table className="min-w-full divide-y divide-border-subtle text-sm">
            <thead className="bg-surface-hover text-xs uppercase tracking-wider text-secondary">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">発行日時</th>
                <th className="px-4 py-2 text-left font-semibold">施工店</th>
                <th className="px-4 py-2 text-left font-semibold">テンプレート</th>
                <th className="px-4 py-2 text-left font-semibold">不足項目</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.flagged.map((f) => (
                <tr key={f.public_id}>
                  <td className="px-4 py-2 whitespace-nowrap text-secondary">
                    {new Date(f.created_at).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-primary">{f.tenant_name ?? "(削除済)"}</td>
                  <td className="px-4 py-2 text-secondary">{f.template_name ?? "-"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {f.flags.map((fl) => (
                        <span
                          key={fl}
                          className="inline-block rounded-full bg-danger-dim px-2 py-0.5 text-xs font-medium text-danger-text"
                        >
                          {QUALITY_FLAG_LABELS[fl]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <a
                      href={`/c/${encodeURIComponent(f.public_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      公開ページ →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
