"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  coating: "コーティング",
  ppf: "PPF",
  maintenance: "整備",
  body_repair: "鈑金塗装",
  general: "汎用",
};

type Entry = {
  id: string;
  name: string;
  description: string | null;
  service_type: string | null;
  layout_key: string;
  thumbnail_path: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  certificate_count: number;
  last_issued_at: string | null;
};

export default function TemplatesClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/manufacturer/templates", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.message ?? "読み込みに失敗しました。");
        setEntries(json.entries ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div className="rounded-md border border-danger-border bg-danger-dim p-3 text-sm text-danger-text">{err}</div>
    );
  }
  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-sm text-secondary">
        まだテンプレートが登録されていません。Ledra 運営に入稿をご依頼ください。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {entries.map((t) => (
        <div key={t.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-primary">{t.name}</h3>
                {t.service_type && (
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">
                    {SERVICE_TYPE_LABELS[t.service_type] ?? t.service_type}
                  </span>
                )}
                {!t.is_active && (
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">非公開</span>
                )}
              </div>
              {t.description && <p className="text-sm text-secondary">{t.description}</p>}
              <p className="text-xs text-muted">
                layout: {t.layout_key} · 更新: {new Date(t.updated_at).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border-subtle pt-3">
            <div>
              <div className="text-xs text-secondary">累計発行件数</div>
              <div className="text-lg font-semibold text-primary">{t.certificate_count.toLocaleString("ja-JP")}</div>
            </div>
            <div>
              <div className="text-xs text-secondary">最終発行</div>
              <div className="text-sm text-primary">
                {t.last_issued_at ? new Date(t.last_issued_at).toLocaleDateString("ja-JP") : "未発行"}
              </div>
            </div>
          </div>

          {t.certificate_count > 0 && (
            <div className="mt-3 text-right">
              <Link
                href={`/manufacturer/certificates?template_id=${t.id}`}
                className="text-xs font-medium text-accent hover:underline"
              >
                このテンプレートの発行履歴 →
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
