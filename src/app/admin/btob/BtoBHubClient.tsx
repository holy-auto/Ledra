"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MarketVehiclesClient from "../market-vehicles/MarketVehiclesClient";
import DealsClient from "../deals/DealsClient";

const TABS = [
  { id: "inventory", label: "在庫管理" },
  { id: "market", label: "在庫共有" },
  { id: "deals", label: "商談管理" },
] as const;

export default function BtoBHubClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") ?? "inventory";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    router.replace(`/admin/btob?tab=${tabId}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="BtoB PLATFORM"
        title="BtoB中古車プラットフォーム"
        description="在庫管理・在庫共有・商談を一元管理"
        tabs={TABS.map((tab) => ({ key: tab.id, label: tab.label }))}
        activeTab={activeTab}
        onTabSelect={handleTabChange}
      />

      {/* Tab Content */}
      <div>
        {activeTab === "inventory" && <MarketVehiclesClient />}
        {activeTab === "market" && (
          <div className="space-y-4">
            <div className="glass-card p-6 text-center space-y-3">
              <div className="text-base font-semibold text-primary">BtoB在庫共有マーケット</div>
              <p className="text-sm text-secondary">他の施工店が公開している在庫を閲覧・問い合わせできます。</p>
              <a
                href="/market"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2"
              >
                マーケットを開く
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
              </a>
            </div>
          </div>
        )}
        {activeTab === "deals" && <DealsClient />}
      </div>
    </div>
  );
}
