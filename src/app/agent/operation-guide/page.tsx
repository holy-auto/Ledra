import Link from "next/link";
import OperationGuideContent from "@/components/OperationGuideContent";
import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";

export const dynamic = "force-dynamic";

const TOTAL_GUIDES = OPERATION_GUIDE_GROUPS.reduce((s, g) => s + g.guides.length, 0);

/**
 * 代理店ポータル内の操作ガイド画面。
 * 公開ページ /guide と同じ内容をパートナー向けに表示。
 * 施工店との商談・導入支援時にこのページを見せながら説明できる。
 */
export default function AgentOperationGuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
          OPERATION GUIDE
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-primary">Ledra 操作ガイド</h1>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          施工店様向けの公式操作ガイドです。商談時の説明資料、導入後のフォロー資料としてご活用いただけます。
          このページの内容は <code className="rounded bg-surface-hover px-1.5 py-0.5 text-[11px]">/guide</code>{" "}
          で公開されており、URLをそのまま施工店様にメール・LINE で共有できます。
        </p>
      </div>

      {/* Sales-oriented action bar */}
      <div className="rounded-2xl border border-accent/30 bg-accent-dim/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-primary flex items-center gap-2">施工店に共有する</div>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              ログイン不要の公開ページです。URL を伝えれば誰でも閲覧できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/guide"
              target="_blank"
              className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1"
            >
              公開ページを開く<span aria-hidden>↗</span>
            </Link>
            <Link href="/agent/materials" className="btn-secondary text-xs px-3 py-1.5">
              他の営業資料へ
            </Link>
          </div>
        </div>
      </div>

      {/* Table of contents */}
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">CONTENTS</div>
        <h3 className="mt-1 text-base font-bold text-primary">目次 — 全 {TOTAL_GUIDES} ガイド</h3>
        <div className="mt-4 space-y-4">
          {OPERATION_GUIDE_GROUPS.map((group, gi) => (
            <div key={group.id}>
              <div className="text-sm font-semibold text-primary mb-1">
                {String(gi + 1).padStart(2, "0")}. {group.label}
              </div>
              <ul className="grid gap-1 sm:grid-cols-2 text-xs text-secondary pl-4">
                {group.guides.map((g) => (
                  <li key={g.id}>
                    <a href={`#guide-${g.id}`} className="hover:text-accent hover:underline">
                      {g.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <OperationGuideContent showInternalLinks={false} />
    </div>
  );
}
