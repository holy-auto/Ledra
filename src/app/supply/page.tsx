"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import {
  SUPPLY_PARTNER_STATUS_LABELS,
  SUPPLY_INTEGRATION_STATUS_LABELS,
  normalizeSupplyPartnerStatus,
  normalizeSupplyApiAuthType,
  type SupplyPartnerProfile,
} from "@/types/supply";

type ProfileResponse = {
  ok: boolean;
  partner: SupplyPartnerProfile | null;
  credentials_configured?: boolean;
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border-default bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold text-primary">{value}</div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
    </div>
  );
}

export default function SupplyDashboardPage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, prodRes] = await Promise.all([
          fetch("/api/supply/profile", { cache: "no-store" }),
          fetch("/api/supply/products", { cache: "no-store" }),
        ]);
        const pJson = (await pRes.json().catch(() => null)) as ProfileResponse | null;
        const prodJson = await prodRes.json().catch(() => null);
        if (cancelled) return;
        if (pJson) setData(pJson);
        if (prodJson?.products) setProductCount(prodJson.products.length);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const partner = data?.partner ?? null;
  const status = normalizeSupplyPartnerStatus(partner?.status);
  const integration = partner?.integration_status ?? "unconfigured";
  const credentialsConfigured = data?.credentials_configured ?? false;
  const authType = normalizeSupplyApiAuthType(partner?.api_auth_type);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="SUPPLY PORTAL"
        title="ダッシュボード"
        description="商材カタログと API 連携の設定状況を確認できます。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ステータス" value={SUPPLY_PARTNER_STATUS_LABELS[status]} />
        <StatCard label="商材登録数" value={productCount != null ? `${productCount}` : "—"} sub="件" />
        <StatCard
          label="API 連携"
          value={SUPPLY_INTEGRATION_STATUS_LABELS[integration]}
          sub={credentialsConfigured ? "鍵 設定済み" : "鍵 未設定"}
        />
      </div>

      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-primary">次のステップ</h2>
        <ul className="space-y-2 text-sm text-secondary">
          <li className="flex items-center justify-between gap-4">
            <span>① 商材カタログを登録する（品番・卸値・リードタイム）</span>
            <Link href="/supply/products" className="text-accent hover:underline shrink-0">
              カタログへ
            </Link>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span>② 発注 API を連携する（任意 / 未設定ならメール発注）</span>
            <Link href="/supply/integration" className="text-accent hover:underline shrink-0">
              連携設定へ
            </Link>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span>③ 連絡先・事業者名を更新する</span>
            <Link href="/supply/settings" className="text-accent hover:underline shrink-0">
              プロフィールへ
            </Link>
          </li>
        </ul>
        {authType === "none" && (
          <p className="text-xs text-muted">※ API 連携が未設定の場合、発注は登録された連絡先メール宛に送られます。</p>
        )}
      </div>
    </div>
  );
}
