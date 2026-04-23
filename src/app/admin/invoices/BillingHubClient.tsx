"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import InvoicesClient from "./InvoicesClient";
import DocumentsClient from "../documents/DocumentsClient";
import RevenueAnalytics from "./RevenueAnalytics";

type DocTypeCard = {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  tab: "invoices" | "documents";
  docTypeFilter?: string;
};

const DOC_TYPE_CARDS: DocTypeCard[] = [
  {
    id: "invoice",
    label: "請求書",
    description: "顧客への請求書を作成・管理",
    icon: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    color: "var(--accent-red)",
    tab: "invoices",
  },
  {
    id: "estimate",
    label: "見積書",
    description: "施工費用の見積書を作成",
    icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z",
    color: "var(--accent-blue)",
    tab: "documents",
    docTypeFilter: "estimate",
  },
  {
    id: "delivery",
    label: "納品書",
    description: "施工完了時の納品書を発行",
    icon: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
    color: "var(--accent-emerald)",
    tab: "documents",
    docTypeFilter: "delivery",
  },
  {
    id: "receipt",
    label: "領収書",
    description: "入金確認後の領収書を発行",
    icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z",
    color: "var(--accent-emerald)",
    tab: "documents",
    docTypeFilter: "receipt",
  },
  {
    id: "purchase_order",
    label: "発注書",
    description: "仕入先への発注書を作成",
    icon: "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    color: "var(--accent-amber)",
    tab: "documents",
    docTypeFilter: "purchase_order",
  },
  {
    id: "all_documents",
    label: "全帳票一覧",
    description: "すべての帳票を一覧表示",
    icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z",
    color: "var(--accent-violet)",
    tab: "documents",
  },
];

export default function BillingHubClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialView = searchParams.get("view") ?? "";
  const [activeView, setActiveView] = useState(initialView);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Fetch summary counts
  useEffect(() => {
    (async () => {
      try {
        const [invRes, docRes] = await Promise.all([
          fetch("/api/admin/invoices", { cache: "no-store" })
            .then((r) => r.json())
            .catch((): null => null),
          fetch("/api/admin/documents", { cache: "no-store" })
            .then((r) => r.json())
            .catch((): null => null),
        ]);
        const c: Record<string, number> = {};
        c.invoice = invRes?.stats?.total ?? invRes?.invoices?.length ?? 0;
        c.all_documents = docRes?.stats?.total ?? docRes?.documents?.length ?? 0;
        // count by doc_type
        if (docRes?.documents) {
          for (const d of docRes.documents) {
            c[d.doc_type] = (c[d.doc_type] ?? 0) + 1;
          }
        }
        setCounts(c);
      } catch {}
    })();
  }, []);

  const handleSelect = (card: DocTypeCard) => {
    setActiveView(card.id);
    router.replace(`/admin/invoices?view=${card.id}`, { scroll: false });
  };

  const handleBack = () => {
    setActiveView("");
    router.replace("/admin/invoices", { scroll: false });
  };

  // If a specific view is active, show the appropriate component
  if (activeView === "invoice") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent/90 transition-colors"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          帳票メニューに戻る
        </button>
        <InvoicesClient />
      </div>
    );
  }

  if (activeView && activeView !== "invoice") {
    const card = DOC_TYPE_CARDS.find((c) => c.id === activeView);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent/90 transition-colors"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          帳票メニューに戻る
        </button>
        <DocumentsClient initialTypeFilter={card?.docTypeFilter} />
      </div>
    );
  }

  // Main hub view - card grid
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <span className="text-[11px] font-medium tracking-[0.12em] text-secondary">請求・帳票</span>
        <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">請求・帳票管理</h1>
        <p className="text-[14px] text-secondary leading-relaxed">作成したい書類の種類を選択してください</p>
      </div>

      {/* Revenue Analytics */}
      <RevenueAnalytics />

      {/* Document Type Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_TYPE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleSelect(card)}
            className="glass-card p-5 text-left hover:bg-surface-hover transition-all duration-200 group relative overflow-hidden"
          >
            {/* Color accent bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all duration-200 group-hover:w-1.5"
              style={{ backgroundColor: card.color }}
            />

            <div className="flex items-start gap-3 pl-2">
              {/* Icon */}
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: `${card.color}12` }}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={card.color} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-primary">{card.label}</h3>
                  {counts[card.id] != null && counts[card.id] > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: `${card.color}15`, color: card.color }}
                    >
                      {counts[card.id]}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-secondary mt-0.5 leading-relaxed">{card.description}</p>
              </div>

              {/* Arrow */}
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="shrink-0 text-muted group-hover:text-primary transition-all duration-200 group-hover:translate-x-0.5 mt-1"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Document counts */}
      <div className="text-[11px] text-muted text-center">
        請求書 {counts.invoice ?? 0}件 / 帳票 {counts.all_documents ?? 0}件 / {DOC_TYPE_CARDS.length - 1}種類対応
      </div>
    </div>
  );
}
