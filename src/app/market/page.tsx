"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatJpy } from "@/lib/format";

type MarketVehicle = {
  id: string;
  tenant_id: string;
  maker: string;
  model: string;
  grade: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  body_type: string | null;
  asking_price: number | null;
  wholesale_price: number | null;
  status: string;
  listed_at: string | null;
  description: string | null;
  features: string[] | null;
  images?: { id: string; storage_path: string; sort_order: number }[];
  tenant_name?: string;
};

const BODY_TYPES = ["", "セダン", "SUV", "ミニバン", "軽", "クーペ", "ワゴン", "トラック", "その他"];

const statusVariant = (s: string) => {
  switch (s) {
    case "listed": return "success" as const;
    case "reserved": return "warning" as const;
    case "sold": return "info" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => {
  switch (s) {
    case "listed": return "出品中";
    case "reserved": return "商談中";
    case "sold": return "成約済";
    default: return s;
  }
};

export default function MarketPage() {
  const [vehicles, setVehicles] = useState<MarketVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minYear, setMinYear] = useState("");
  const [maxYear, setMaxYear] = useState("");

  const fetchVehicles = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ public: "true" });
      if (search) params.set("search", search);
      if (bodyType) params.set("body_type", bodyType);
      const res = await fetch(`/api/admin/market-vehicles?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setVehicles(j?.vehicles ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, [search, bodyType]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchVehicles();
      setLoading(false);
    })();
  }, [fetchVehicles]);

  // Client-side price/year filtering
  const filtered = vehicles.filter((v) => {
    if (minPrice && (v.asking_price ?? 0) < parseInt(minPrice, 10)) return false;
    if (maxPrice && (v.asking_price ?? 0) > parseInt(maxPrice, 10)) return false;
    if (minYear && (v.year ?? 0) < parseInt(minYear, 10)) return false;
    if (maxYear && (v.year ?? 0) > parseInt(maxYear, 10)) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600 mb-3">
            MARKET
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">BtoB中古車在庫共有</h1>
          <p className="mt-2 text-sm text-secondary">全テナントの出品中車両を横断検索できます</p>
        </div>
        <Link href="/admin" className="btn-ghost">管理画面へ戻る</Link>
      </header>

      {/* Filters */}
      <section className="glass-card p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted">メーカー・車種</label>
            <input
              type="text"
              className="input-field"
              placeholder="例: トヨタ プリウス"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">ボディタイプ</label>
            <select className="select-field" value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
              <option value="">すべて</option>
              {BODY_TYPES.filter(Boolean).map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">年式</label>
            <div className="flex gap-1 items-center">
              <input type="number" className="input-field" placeholder="から" value={minYear} onChange={(e) => setMinYear(e.target.value)} />
              <span className="text-muted text-xs">〜</span>
              <input type="number" className="input-field" placeholder="まで" value={maxYear} onChange={(e) => setMaxYear(e.target.value)} />
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted">価格帯（税抜）</label>
            <div className="flex gap-1 items-center">
              <input type="number" className="input-field" placeholder="下限" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <span className="text-muted text-xs">〜</span>
              <input type="number" className="input-field" placeholder="上限" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && filtered.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(0,113,227,0.08)]">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#0071e3" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <p className="text-lg font-medium text-primary">出品中の車両はありません</p>
          <p className="mt-2 text-sm text-secondary">条件を変更して再検索するか、BtoB在庫管理から車両を出品してください。</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="text-sm text-muted mb-4">{filtered.length} 件の車両</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((v) => (
              <Link
                key={v.id}
                href={`/market/${v.id}`}
                className="glass-card overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Image */}
                <div className="relative aspect-[16/10] bg-neutral-100 flex items-center justify-center text-muted">
                  {v.images && v.images.length > 0 ? (
                    <Image
                      src={v.images[0].storage_path}
                      alt={`${v.maker} ${v.model}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                    </svg>
                  )}
                </div>
                {/* Info */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-muted">{v.maker}</div>
                      <div className="text-base font-semibold text-primary">
                        {v.model}
                        {v.grade && <span className="text-sm text-secondary ml-1">{v.grade}</span>}
                      </div>
                    </div>
                    <Badge variant={statusVariant(v.status)}>{statusLabel(v.status)}</Badge>
                  </div>
                  <div className="flex gap-3 text-xs text-secondary flex-wrap">
                    {v.year && <span>{v.year}年式</span>}
                    {v.mileage != null && <span>{v.mileage.toLocaleString()}km</span>}
                    {v.color && <span>{v.color}</span>}
                    {v.body_type && <span>{v.body_type}</span>}
                  </div>
                  {v.asking_price != null && (
                    <div className="text-lg font-bold text-primary">
                      {formatJpy(v.asking_price)}
                      <span className="text-xs font-normal text-muted ml-1">(税抜)</span>
                    </div>
                  )}
                  {v.wholesale_price != null && (
                    <div className="text-sm text-secondary">
                      卸価格: {formatJpy(v.wholesale_price)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
