"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { SUPPLY_API_AUTH_TYPE_LABELS, normalizeSupplyApiAuthType } from "@/types/supply";

/* ---------- Types ---------- */

type DirectoryPartner = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  api_auth_type: string;
  integration_status: string;
  linked: boolean;
};

type StorePartnerProduct = {
  id: string;
  supply_partner_id: string;
  sku: string;
  name: string;
  category: string | null;
  list_price: number | null;
  currency: string;
  stock_status: string | null;
  lead_time_days: number | null;
};

type InventoryItemLite = {
  id: string;
  name: string;
  sku: string | null;
  supply_partner_product_id: string | null;
  supplier_sku: string | null;
};

type PartnersResponse = { ok: boolean; partners: DirectoryPartner[] };
type ProductsResponse = { ok: boolean; products: StorePartnerProduct[] };
type ItemsResponse = { items: InventoryItemLite[] };

/**
 * 店舗向け: 供給パートナーとの提携 + 在庫品目の商材マッピング。
 * /admin/inventory に section として埋め込む。AI 自動受発注の「商材・連絡先・API を
 * 卸元本人が入れる」構想の店舗側エントリ。
 */
export default function SupplyLinkSection() {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapPartnerId, setMapPartnerId] = useState<string | null>(null);

  const { data: dir, mutate: mutateDir } = useSWR<PartnersResponse>(
    open ? "/api/admin/supply/partners" : null,
    fetcher,
  );
  const partners = useMemo(() => dir?.partners ?? [], [dir]);
  const linkedPartners = useMemo(() => partners.filter((p) => p.linked), [partners]);

  // マッピング対象パートナーの商材 + 自店の在庫品目
  const { data: prodData } = useSWR<ProductsResponse>(
    mapPartnerId ? `/api/admin/supply/products?partner_id=${mapPartnerId}` : null,
    fetcher,
  );
  const { data: itemsData, mutate: mutateItems } = useSWR<ItemsResponse>(
    mapPartnerId ? "/api/admin/inventory/items?active_only=true" : null,
    fetcher,
  );
  const products = prodData?.products ?? [];
  const items = itemsData?.items ?? [];

  const toggleLink = async (partnerId: string, enabled: boolean) => {
    setBusyId(partnerId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/supply/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supply_partner_id: partnerId, enabled }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "更新に失敗しました。" });
        return;
      }
      await mutateDir();
      if (!enabled && mapPartnerId === partnerId) setMapPartnerId(null);
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setBusyId(null);
    }
  };

  const mapItem = async (itemId: string, productId: string | null) => {
    setBusyId(itemId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/supply/map-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, product_id: productId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "紐付けに失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: productId ? "紐付けました。" : "解除しました。" });
      await mutateItems();
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border-subtle p-5 text-left"
      >
        <div>
          <div className="text-base font-semibold text-primary">仕入先連携（供給パートナー）</div>
          <div className="text-xs text-muted">
            卸元・メーカーが登録した商材カタログと提携し、在庫品目に紐付けると自動発注の対象になります。
          </div>
        </div>
        <span className="text-muted text-sm">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>

      {open && (
        <div className="space-y-6 p-5">
          {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

          {/* Directory */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-primary">提携できるパートナー</div>
            {partners.length === 0 ? (
              <div className="text-sm text-muted">現在、提携可能なパートナーがいません。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold tracking-[0.12em] text-muted">事業者</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold tracking-[0.12em] text-muted">連絡先</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold tracking-[0.12em] text-muted">
                        発注方法
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold tracking-[0.12em] text-muted">提携</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {partners.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5 text-primary">{p.name}</td>
                        <td className="px-4 py-2.5 text-secondary text-xs">
                          {p.contact_email ?? p.contact_phone ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-secondary text-xs">
                          {p.integration_status === "connected"
                            ? "API 連携"
                            : SUPPLY_API_AUTH_TYPE_LABELS[normalizeSupplyApiAuthType(p.api_auth_type)]}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => toggleLink(p.id, !p.linked)}
                            className={p.linked ? "btn-ghost text-xs" : "btn-primary text-xs"}
                          >
                            {p.linked ? "提携解除" : "提携する"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Item mapping */}
          {linkedPartners.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-primary">在庫品目を商材に紐付け</div>
              <select
                className="input-field max-w-xs"
                value={mapPartnerId ?? ""}
                onChange={(e) => setMapPartnerId(e.target.value || null)}
              >
                <option value="">パートナーを選択…</option>
                {linkedPartners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {mapPartnerId && (
                <div className="overflow-x-auto pt-2">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-hover">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold tracking-[0.12em] text-muted">
                          在庫品目
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold tracking-[0.12em] text-muted">
                          紐付ける商材
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {items.map((it) => {
                        // この品目が現在このパートナーの商材に紐付いているか
                        const current = products.find((pr) => pr.id === it.supply_partner_product_id);
                        return (
                          <tr key={it.id}>
                            <td className="px-4 py-2.5 text-primary">
                              {it.name}
                              {it.sku && <span className="ml-1 text-xs text-muted">({it.sku})</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                className="input-field"
                                disabled={busyId === it.id}
                                value={current?.id ?? ""}
                                onChange={(e) => mapItem(it.id, e.target.value || null)}
                              >
                                <option value="">— 紐付けなし —</option>
                                {products.map((pr) => (
                                  <option key={pr.id} value={pr.id}>
                                    {pr.name} ({pr.sku})
                                    {pr.list_price != null ? ` · ¥${pr.list_price.toLocaleString("ja-JP")}` : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-muted">
                            在庫品目がありません。先に品目を登録してください。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
