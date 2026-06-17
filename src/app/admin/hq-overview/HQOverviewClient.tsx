"use client";

/**
 * 本社横断ビュー。
 * 本社ユーザが「組織 → 店舗 → 顧客/車両/作業履歴」とドリルダウンして
 * 配下全店舗のデータを横断「閲覧」する (書込手段は提供しない)。
 * 参照する API はすべて Phase 2 の本社横断リード API。
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { parseJsonSafe } from "@/lib/api/safeJson";

interface Organization {
  id: string;
  name: string;
}
interface Store {
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string | null;
  role: string;
}
interface Customer {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  source_system: string | null;
}
interface Vehicle {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
  source_system: string | null;
}
interface WorkHistory {
  id: string;
  vehicle_id: string;
  type: string;
  title: string;
  performed_at: string;
  source_system: string | null;
}

type Tab = "customers" | "vehicles" | "work-history";
const TAB_LABELS: Record<Tab, string> = {
  customers: "顧客",
  vehicles: "車両",
  "work-history": "作業履歴",
};
const PAGE_SIZE = 50;

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

export default function HQOverviewClient() {
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("customers");

  // 組織一覧
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/organizations", { cache: "no-store" });
      const json = await parseJsonSafe<{ organizations?: Organization[] }>(res);
      const list = json?.organizations ?? [];
      setOrgs(list);
      if (list.length > 0) setOrgId(list[0].id);
    })();
  }, []);

  // 店舗一覧 (組織選択時)
  useEffect(() => {
    if (!orgId) return;
    setStores(null);
    setStoreId(null);
    void (async () => {
      const res = await fetch(`/api/admin/organizations/${orgId}/stores`, { cache: "no-store" });
      const json = await parseJsonSafe<{ stores?: Store[] }>(res);
      const list = json?.stores ?? [];
      setStores(list);
      if (list.length > 0) setStoreId(list[0].tenant_id);
    })();
  }, [orgId]);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="HQ OVERVIEW"
        title="本社横断ビュー"
        description="組織配下の全店舗の顧客・車両・作業履歴を横断閲覧します（閲覧のみ。編集は各店舗で行います）。"
      />

      {orgs !== null && orgs.length === 0 && (
        <div className="glass-card p-5 text-sm text-secondary">
          所属する組織がありません。
          <a className="text-accent underline" href="/admin/organizations">
            組織管理
          </a>{" "}
          で組織を作成し、店舗を紐づけてください。
        </div>
      )}

      {orgs && orgs.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          {orgs.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-muted">組織</label>
              <select
                className="input-field mt-1 w-full max-w-sm"
                value={orgId ?? ""}
                onChange={(e) => setOrgId(e.target.value)}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted">店舗</label>
            {stores === null ? (
              <p className="mt-1 text-sm text-muted">読み込み中…</p>
            ) : stores.length === 0 ? (
              <p className="mt-1 text-sm text-muted">この組織に紐づく店舗がありません。</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {stores.map((s) => (
                  <button
                    key={s.tenant_id}
                    onClick={() => setStoreId(s.tenant_id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      storeId === s.tenant_id
                        ? "border-accent bg-accent/10 text-primary"
                        : "border-default text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {s.tenant_name ?? s.tenant_id.slice(0, 8)}
                    {s.plan_tier && <span className="ml-1 text-[10px] text-muted">{s.plan_tier}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {orgId && storeId && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex gap-2 border-b border-default pb-2">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-4 py-2 text-sm ${
                  tab === t ? "bg-accent/10 font-semibold text-primary" : "text-secondary hover:text-primary"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <StoreData key={`${orgId}:${storeId}:${tab}`} orgId={orgId} tenantId={storeId} tab={tab} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 各タブのデータ表示 (ページング付き)
// ─────────────────────────────────────────────────────────────
function StoreData({ orgId, tenantId, tab }: { orgId: string; tenantId: string; tab: Tab }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setRows(null);
    const res = await fetch(
      `/api/admin/organizations/${orgId}/stores/${tenantId}/${tab}?limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" },
    );
    const key = tab === "work-history" ? "work_history" : tab;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await parseJsonSafe<Record<string, any>>(res);
    setRows((json?.[key] as unknown[]) ?? []);
    setTotal((json?.total as number) ?? 0);
  }, [orgId, tenantId, tab, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return <p className="text-sm text-muted">読み込み中…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted">データがありません。</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        {tab === "customers" && <CustomersTable rows={rows as Customer[]} />}
        {tab === "vehicles" && <VehiclesTable rows={rows as Vehicle[]} />}
        {tab === "work-history" && <WorkHistoryTable rows={rows as WorkHistory[]} />}
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {offset + 1}–{offset + rows.length} / {total} 件
        </span>
        <div className="flex gap-2">
          <button
            className="btn-ghost px-3 py-1 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            前へ
          </button>
          <button
            className="btn-ghost px-3 py-1 disabled:opacity-40"
            disabled={offset + rows.length >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs text-muted">{children}</th>;
}

function CustomersTable({ rows }: { rows: Customer[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-surface-hover">
        <tr>
          <Th>名前</Th>
          <Th>カナ</Th>
          <Th>メール</Th>
          <Th>電話</Th>
          <Th>連携元</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-t border-default">
            <td className="px-3 py-2">{c.name}</td>
            <td className="px-3 py-2 text-secondary">{c.name_kana ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{c.email ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{c.phone ?? "—"}</td>
            <td className="px-3 py-2 text-[11px] text-muted">{c.source_system ?? "手動"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VehiclesTable({ rows }: { rows: Vehicle[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-surface-hover">
        <tr>
          <Th>ナンバー</Th>
          <Th>メーカー</Th>
          <Th>車種</Th>
          <Th>年式</Th>
          <Th>顧客</Th>
          <Th>連携元</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.id} className="border-t border-default">
            <td className="px-3 py-2">{v.plate_display ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{v.maker ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{v.model ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{v.year ?? "—"}</td>
            <td className="px-3 py-2 text-secondary">{v.customer_name ?? "—"}</td>
            <td className="px-3 py-2 text-[11px] text-muted">{v.source_system ?? "手動"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WorkHistoryTable({ rows }: { rows: WorkHistory[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-surface-hover">
        <tr>
          <Th>実施日</Th>
          <Th>種別</Th>
          <Th>内容</Th>
          <Th>連携元</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => (
          <tr key={w.id} className="border-t border-default">
            <td className="px-3 py-2">{fmtDate(w.performed_at)}</td>
            <td className="px-3 py-2 text-secondary">{w.type}</td>
            <td className="px-3 py-2">{w.title}</td>
            <td className="px-3 py-2 text-[11px] text-muted">{w.source_system ?? "手動"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
