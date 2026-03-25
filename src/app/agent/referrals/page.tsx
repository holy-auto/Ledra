"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { AGENT_REFERRAL_STATUS_MAP, getStatusEntry } from "@/lib/statusMaps";
import { formatDateTime } from "@/lib/format";
import { fetcher } from "@/lib/swr";

/* ── Types ── */

type Referral = {
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
};

type ReferralsData = {
  referrals: Referral[];
};

/* ── Status filter options ── */

const STATUS_OPTIONS = [
  { value: "", label: "すべてのステータス" },
  { value: "pending", label: "審査待ち" },
  { value: "contacted", label: "連絡済み" },
  { value: "in_negotiation", label: "商談中" },
  { value: "trial", label: "トライアル中" },
  { value: "contracted", label: "契約成立" },
  { value: "cancelled", label: "キャンセル" },
  { value: "churned", label: "解約" },
];

/* ── Sort helpers ── */

type SortKey = "referral_code" | "shop_name" | "status" | "contact" | "created_at";
type SortDir = "asc" | "desc";

function sortReferrals(rows: Referral[], key: SortKey, dir: SortDir): Referral[] {
  const sorted = [...rows].sort((a, b) => {
    let va: string;
    let vb: string;
    switch (key) {
      case "referral_code":
        va = a.referral_code;
        vb = b.referral_code;
        break;
      case "shop_name":
        va = a.shop_name;
        vb = b.shop_name;
        break;
      case "status":
        va = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, a.status).label;
        vb = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, b.status).label;
        break;
      case "contact":
        va = a.contact_email || a.contact_phone || "";
        vb = b.contact_email || b.contact_phone || "";
        break;
      case "created_at":
        va = a.created_at;
        vb = b.created_at;
        break;
      default:
        va = "";
        vb = "";
    }
    return va.localeCompare(vb, "ja");
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

/* ── Page ── */

export default function AgentReferralsPage() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* Build SWR key from active filters */
  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeSearch) params.set("q", activeSearch);
    if (statusFilter) params.set("status", statusFilter);
    return `/api/agent/referrals?${params.toString()}`;
  })();

  const { data, error: swrError, isLoading: loading } = useSWR<ReferralsData>(
    swrKey,
    fetcher,
    { revalidateOnFocus: true, keepPreviousData: true, dedupingInterval: 2000 },
  );

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  const rows = data?.referrals ? sortReferrals(data.referrals, sortKey, sortDir) : [];

  /* ── Handlers ── */

  const handleSearch = () => {
    setActiveSearch(search.trim());
  };

  const handleClear = () => {
    setSearch("");
    setActiveSearch("");
    setStatusFilter("");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  /* ── Skeleton ── */

  const LoadingSkeleton = () => (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-4">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-28 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <PageHeader
        tag="REFERRALS"
        title="紹介管理"
        description="紹介先店舗の登録・管理を行います。"
        actions={
          <Link href="/agent/referrals/new" className="btn-primary">
            新規紹介
          </Link>
        }
      />

      {/* Filter row */}
      <section className="glass-card p-5">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-0 space-y-1">
            <label className="text-xs text-muted">検索（店舗名・担当者名・コード）</label>
            <input
              type="text"
              placeholder="検索キーワード"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="input-field"
            />
          </div>
          <div className="w-48 space-y-1">
            <label className="text-xs text-muted">ステータス</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-secondary" onClick={handleSearch}>
            検索
          </button>
          <button type="button" className="btn-ghost" onClick={handleClear}>
            クリア
          </button>
        </div>
      </section>

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Error */}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {/* Results table */}
      {data && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              紹介一覧（{rows.length}件）
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted cursor-pointer select-none hover:text-primary"
                    onClick={() => toggleSort("referral_code")}
                  >
                    紹介コード{sortIndicator("referral_code")}
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted cursor-pointer select-none hover:text-primary"
                    onClick={() => toggleSort("shop_name")}
                  >
                    店舗名{sortIndicator("shop_name")}
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted cursor-pointer select-none hover:text-primary"
                    onClick={() => toggleSort("status")}
                  >
                    ステータス{sortIndicator("status")}
                  </th>
                  <th
                    className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted cursor-pointer select-none hover:text-primary"
                    onClick={() => toggleSort("contact")}
                  >
                    連絡先{sortIndicator("contact")}
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted cursor-pointer select-none hover:text-primary"
                    onClick={() => toggleSort("created_at")}
                  >
                    登録日{sortIndicator("created_at")}
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((r) => {
                  const st = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, r.status);
                  return (
                    <tr key={r.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-secondary">
                        {r.referral_code}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/agent/referrals/${r.id}`}
                          className="font-medium text-primary hover:text-accent underline"
                        >
                          {r.shop_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="hidden md:table-cell px-5 py-3.5 text-secondary">
                        {r.contact_email || r.contact_phone || "-"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/agent/referrals/${r.id}`}
                          className="btn-ghost px-3 py-1 text-xs"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted">
                      <div className="space-y-2">
                        <div className="text-lg">紹介データがありません</div>
                        <div className="text-xs">
                          「新規紹介」ボタンから紹介先を登録してください。
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
