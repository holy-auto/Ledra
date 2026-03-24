"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { AGENT_REFERRAL_STATUS_MAP, getStatusEntry } from "@/lib/statusMaps";
import { formatDateTime, formatDate } from "@/lib/format";
import { fetcher } from "@/lib/swr";

/* ── Types ── */

type StatusHistoryEntry = {
  status: string;
  changed_at: string;
  note: string | null;
};

type ReferralDetail = {
  id: string;
  referral_code: string;
  shop_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  commission_rate: number | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
  status_history: StatusHistoryEntry[];
};

/* ── Editable statuses ── */

const EDITABLE_STATUSES = new Set(["pending", "contacted", "in_negotiation", "trial"]);

/* ── Skeleton ── */

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
        <div className="h-7 w-48 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="glass-card p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-40 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="glass-card p-6 space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-hover" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-surface-hover" />
        ))}
      </div>
    </div>
  );
}

/* ── Detail row helper ── */

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border-subtle last:border-0">
      <dt className="w-40 shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm text-primary">{children}</dd>
    </div>
  );
}

/* ── Page ── */

export default function ReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, error: swrError, isLoading } = useSWR<ReferralDetail>(
    `/api/agent/referrals/${encodeURIComponent(id)}`,
    fetcher,
    { revalidateOnFocus: true },
  );

  const err = swrError ? (swrError.message ?? "データの取得に失敗しました") : null;

  if (isLoading) return <LoadingSkeleton />;

  if (err) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          tag="REFERRALS"
          title="紹介詳細"
          actions={
            <Link href="/agent/referrals" className="btn-ghost text-xs">
              &larr; 一覧に戻る
            </Link>
          }
        />
        <div className="glass-card p-6">
          <p className="text-sm text-danger">{err}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const st = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, data.status);
  const canEdit = EDITABLE_STATUSES.has(data.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <PageHeader
        tag="REFERRALS"
        title="紹介詳細"
        description={data.shop_name}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                href={`/agent/referrals/${id}/edit`}
                className="btn-primary text-xs"
              >
                編集
              </Link>
            )}
            <Link href="/agent/referrals" className="btn-ghost text-xs">
              &larr; 一覧に戻る
            </Link>
          </div>
        }
      />

      {/* Status banner */}
      <div className="glass-card p-5 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">現在のステータス</div>
          <div className="mt-1">
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">紹介コード</div>
          <div className="mt-1 font-mono text-sm font-semibold text-primary">
            {data.referral_code}
          </div>
        </div>
      </div>

      {/* Detail card */}
      <section className="glass-card p-6">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">REFERRAL INFO</div>
          <div className="mt-1 text-base font-semibold text-primary">紹介先情報</div>
        </div>

        <dl>
          <DetailRow label="店舗名">{data.shop_name}</DetailRow>
          <DetailRow label="担当者名">{data.contact_name || "-"}</DetailRow>
          <DetailRow label="メールアドレス">
            {data.contact_email ? (
              <a href={`mailto:${data.contact_email}`} className="text-accent hover:underline">
                {data.contact_email}
              </a>
            ) : (
              "-"
            )}
          </DetailRow>
          <DetailRow label="電話番号">
            {data.contact_phone ? (
              <a href={`tel:${data.contact_phone}`} className="text-accent hover:underline">
                {data.contact_phone}
              </a>
            ) : (
              "-"
            )}
          </DetailRow>
          <DetailRow label="コミッション料率">
            {data.commission_rate != null
              ? `${(data.commission_rate * 100).toFixed(1)}%`
              : "未設定"}
          </DetailRow>
          <DetailRow label="備考">
            {data.note ? (
              <span className="whitespace-pre-wrap">{data.note}</span>
            ) : (
              "-"
            )}
          </DetailRow>
          <DetailRow label="登録日">{formatDateTime(data.created_at)}</DetailRow>
          <DetailRow label="最終更新">
            {data.updated_at ? formatDateTime(data.updated_at) : "-"}
          </DetailRow>
        </dl>
      </section>

      {/* Status history / timeline */}
      <section className="glass-card p-6">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">STATUS HISTORY</div>
          <div className="mt-1 text-base font-semibold text-primary">ステータス履歴</div>
        </div>

        {data.status_history && data.status_history.length > 0 ? (
          <div className="relative space-y-0">
            {/* Vertical timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border-default" />

            {data.status_history.map((entry, i) => {
              const entrySt = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, entry.status);
              return (
                <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-accent shadow-sm" />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entrySt.variant}>{entrySt.label}</Badge>
                      <span className="text-xs text-muted">
                        {formatDate(entry.changed_at)}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="mt-1 text-xs text-secondary">{entry.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted">
            ステータス変更の履歴はまだありません。
          </div>
        )}
      </section>
    </div>
  );
}
