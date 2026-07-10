import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchApprovalInbox } from "@/lib/admin/approvalInboxData";
import { logger } from "@/lib/logger";

/**
 * ダッシュボード最上部に置く「AI 自動化の人の承認待ち」ウィジェット。
 * AI / 自動化が用意した下書き（証明書 / 発注 / 請求）が承認待ちの時だけ、
 * 琥珀の目立つカードで件数と内訳を出し、承認インボックスへ誘導する。
 * 0 件の時は何も描画しない（一等地を無駄に占有しない）。
 */
export default async function ApprovalInboxWidget({ tenantId }: { tenantId: string }) {
  let total = 0;
  let sections: { key: string; label: string; count: number }[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const inbox = await fetchApprovalInbox(supabase, tenantId);
    total = inbox.total;
    sections = inbox.sections.map((s) => ({ key: s.key, label: s.label, count: s.count }));
  } catch (e) {
    // ダッシュボードは壊さない。承認ウィジェットは非表示にして続行。
    logger.error("ApprovalInboxWidget fetch failed", e);
    return null;
  }

  if (total === 0) return null;

  return (
    <Link
      href="/admin/inbox"
      data-tour="approval-widget"
      className="block rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 transition-colors hover:bg-amber-500/15"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-primary">承認待ち</span>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{total}</span>
            <span className="text-sm text-muted">件</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            AI が用意した下書きです。内容を確認してワンタップで承認できます。
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-[13px] font-medium text-amber-600 dark:text-amber-400 sm:inline-flex">
          確認する
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </span>
      </div>

      {sections.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 pl-12">
          {sections.map((s) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-base px-2.5 py-1 text-xs text-secondary"
            >
              {s.label}
              <span className="font-semibold text-primary">{s.count}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function ApprovalInboxWidgetSkeleton() {
  return <div className="h-20 animate-pulse rounded-2xl bg-border-subtle" />;
}
