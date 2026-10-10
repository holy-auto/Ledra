import Link from "next/link";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { CTABanner } from "@/components/marketing/CTABanner";
import OperationGuideContent from "@/components/OperationGuideContent";
import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";

export const metadata = {
  title: "操作ガイド | Ledra",
  description:
    "Ledra 管理画面の操作方法をまとめた公式ガイドです。証明書発行・車両/顧客管理・請求書・予約・店舗設定など、初めての方でも迷わず使い始められる手順を網羅しています。",
};

const TOTAL_GUIDES = OPERATION_GUIDE_GROUPS.reduce((s, g) => s + g.guides.length, 0);

export default function OperationGuidePage() {
  return (
    <>
      <Section>
        <SectionHeading
          title="Ledra 操作ガイド"
          subtitle={`証明書発行から店舗設定まで、Ledra の使い方を ${TOTAL_GUIDES} ステップで解説します。資料・人を介さなくても順番に進めれば一通りの業務が回るよう設計されています。`}
          light={false}
        />

        {/* Table of contents */}
        <div className="mx-auto max-w-3xl mt-10 mb-12">
          <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-white">CONTENTS</div>
            <h3 className="mt-1 text-base font-bold text-primary">目次</h3>
            <div className="mt-4 space-y-4">
              {OPERATION_GUIDE_GROUPS.map((group, gi) => (
                <div key={group.id}>
                  <div className="text-sm font-semibold text-primary mb-1">
                    {String(gi + 1).padStart(2, "0")}. {group.label}
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2 text-xs text-white pl-4">
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
        </div>

        <div className="mx-auto max-w-4xl">
          <OperationGuideContent showInternalLinks={false} />
        </div>

        <div className="mx-auto max-w-3xl mt-12 rounded-2xl border border-border-default bg-surface p-6 text-center">
          <h3 className="text-base font-bold text-primary">この資料を共有する</h3>
          <p className="mt-1 text-sm text-white leading-relaxed">
            このページは公開されており、URL ({" "}
            <code className="rounded bg-surface-hover px-1.5 py-0.5 text-[11px]">/guide</code> ) を メール・LINE・Slack
            などでそのまま共有できます。施工店様への導入支援資料としてご活用ください。
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn-secondary text-sm px-4 py-2">
              Ledra について
            </Link>
            <Link href="/signup" className="btn-primary text-sm px-4 py-2">
              無料で始める
            </Link>
          </div>
        </div>
      </Section>

      <CTABanner />
    </>
  );
}
