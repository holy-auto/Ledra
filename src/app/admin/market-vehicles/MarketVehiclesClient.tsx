"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatJpy } from "@/lib/format";

/* ---------- types ---------- */
type VehicleStatus = "draft" | "listed" | "reserved" | "sold" | "withdrawn";

interface VehicleRow {
  id: string;
  maker: string;
  model: string;
  grade: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  asking_price: number | null;
  wholesale_price: number | null;
  cost_price: number | null;
  supplier_name: string | null;
  acquisition_date: string | null;
  status: VehicleStatus;
  body_type: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  listed: number;
  draft: number;
}

/* ---------- helpers ---------- */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "listed", label: "掲載中" },
  { value: "reserved", label: "商談中" },
  { value: "sold", label: "成約済" },
  { value: "withdrawn", label: "取下げ" },
];

const BODY_TYPES: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "セダン", label: "セダン" },
  { value: "SUV", label: "SUV" },
  { value: "ミニバン", label: "ミニバン" },
  { value: "軽", label: "軽" },
  { value: "クーペ", label: "クーペ" },
  { value: "ワゴン", label: "ワゴン" },
  { value: "トラック", label: "トラック" },
  { value: "その他", label: "その他" },
];

const statusLabel = (s: VehicleStatus): string => {
  const m: Record<VehicleStatus, string> = {
    draft: "下書き",
    listed: "掲載中",
    reserved: "商談中",
    sold: "成約済",
    withdrawn: "取下げ",
  };
  return m[s] ?? s;
};

const statusVariant = (s: VehicleStatus): "default" | "success" | "warning" | "danger" | "info" => {
  const m: Record<VehicleStatus, "default" | "success" | "warning" | "danger" | "info"> = {
    draft: "default",
    listed: "success",
    reserved: "warning",
    sold: "info",
    withdrawn: "danger",
  };
  return m[s] ?? "default";
};

const formatMileage = (km: number | null): string => {
  if (km == null) return "-";
  return `${km.toLocaleString("ja-JP")} km`;
};

const calcDaysInStock = (acquisitionDate: string | null, createdAt: string): number => {
  const startDate = acquisitionDate ?? createdAt.slice(0, 10);
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
};

const calcProfit = (askingPrice: number | null, costPrice: number | null): number | null => {
  if (askingPrice == null || costPrice == null) return null;
  return askingPrice - costPrice;
};

/* ---------- component ---------- */
export default function MarketVehiclesClient() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, listed: 0, draft: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [makerFilter, setMakerFilter] = useState("");
  const [bodyTypeFilter, setBodyTypeFilter] = useState("");

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVehicles = useCallback(async (status?: string, maker?: string, bodyType?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (maker) params.set("maker", maker);
      if (bodyType) params.set("body_type", bodyType);
      const res = await fetch(`/api/admin/market-vehicles?${params.toString()}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setVehicles(j?.vehicles ?? []);
      setStats(j?.stats ?? { total: 0, listed: 0, draft: 0 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchVehicles();
      setLoading(false);
    })();
  }, [fetchVehicles]);

  const applyFilters = (newStatus: string, newMaker: string, newBodyType: string) => {
    setStatusFilter(newStatus);
    setMakerFilter(newMaker);
    setBodyTypeFilter(newBodyType);
    fetchVehicles(newStatus, newMaker, newBodyType);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この車両を削除しますか?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/market-vehicles/${id}`, {
        method: "DELETE",
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchVehicles(statusFilter, makerFilter, bodyTypeFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("削除に失敗しました: " + msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="マーケット"
        title="BtoB在庫管理"
        description="BtoB中古車在庫の登録・管理を行います。"
        actions={
          <Link href="/admin/market-vehicles/new" className="btn-primary">
            新規登録
          </Link>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.total}</div>
              <div className="mt-1 text-xs text-muted">総車両数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">掲載中</div>
              <div className="mt-2 text-2xl font-bold text-success">{stats.listed}</div>
              <div className="mt-1 text-xs text-muted">掲載中</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">下書き</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.draft}</div>
              <div className="mt-1 text-xs text-muted">下書き</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">在庫総額</div>
              <div className="mt-2 text-2xl font-bold text-accent">
                {formatJpy(
                  vehicles
                    .filter((v) => v.status !== "sold")
                    .reduce((s, v) => s + (v.cost_price ?? v.asking_price ?? 0), 0),
                )}
              </div>
              <div className="mt-1 text-xs text-muted">仕入原価ベース</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">想定利益</div>
              <div className="mt-2 text-2xl font-bold text-success">
                {formatJpy(
                  vehicles
                    .filter((v) => v.status !== "sold" && v.cost_price != null && v.asking_price != null)
                    .reduce((s, v) => s + ((v.asking_price ?? 0) - (v.cost_price ?? 0)), 0),
                )}
              </div>
              <div className="mt-1 text-xs text-muted">販売時見込み</div>
            </div>
          </section>

          {/* Long-stock alerts */}
          {(() => {
            const longStock = vehicles.filter(
              (v) =>
                v.status !== "sold" &&
                v.status !== "withdrawn" &&
                calcDaysInStock(v.acquisition_date, v.created_at) >= 60,
            );
            if (longStock.length === 0) return null;
            return (
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-warning"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-warning">長期在庫アラート</span>
                  <span className="text-xs text-warning">({longStock.length}台が60日以上)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {longStock.map((v) => (
                    <Link
                      key={v.id}
                      href={`/admin/market-vehicles/${v.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-surface px-2.5 py-1 text-xs text-warning hover:bg-warning/5"
                    >
                      {v.maker} {v.model}
                      <span className="font-bold">{calcDaysInStock(v.acquisition_date, v.created_at)}日</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => applyFilters(e.target.value, makerFilter, bodyTypeFilter)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">メーカー</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="メーカー名で検索"
                  value={makerFilter}
                  onChange={(e) => applyFilters(statusFilter, e.target.value, bodyTypeFilter)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">ボディタイプ</label>
                <select
                  className="select-field"
                  value={bodyTypeFilter}
                  onChange={(e) => applyFilters(statusFilter, makerFilter, e.target.value)}
                >
                  {BODY_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Vehicle Cards */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">車両一覧</div>
                <div className="mt-1 text-base font-semibold text-primary">車両一覧</div>
              </div>
              <div className="text-sm text-muted">{vehicles.length} 件</div>
            </div>

            {vehicles.length === 0 && <div className="glass-card p-8 text-center text-muted">車両がありません</div>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <div key={v.id} className="glass-card overflow-hidden flex flex-col">
                  {/* Thumbnail */}
                  <div className="relative aspect-[4/3] bg-surface-hover">
                    {v.thumbnail_url ? (
                      <Image
                        src={v.thumbnail_url}
                        alt={`${v.maker} ${v.model}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted text-sm">No Image</div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant={statusVariant(v.status)}>{statusLabel(v.status)}</Badge>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col p-4 space-y-2">
                    <div className="text-base font-semibold text-primary leading-tight">
                      {v.maker} {v.model}
                      {v.grade && <span className="ml-1 text-sm font-normal text-secondary">{v.grade}</span>}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
                      {v.year && <span>{v.year}年式</span>}
                      {v.mileage != null && <span>{formatMileage(v.mileage)}</span>}
                      {v.color && <span>{v.color}</span>}
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-auto pt-2 border-t border-border-subtle">
                      <div>
                        <div className="text-[10px] text-muted">販売価格</div>
                        <div className="text-sm font-bold text-primary">{formatJpy(v.asking_price)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted">卸価格</div>
                        <div className="text-sm font-medium text-secondary">{formatJpy(v.wholesale_price)}</div>
                      </div>
                      {v.cost_price != null && (
                        <div>
                          <div className="text-[10px] text-muted">利益</div>
                          <div
                            className={`text-sm font-bold ${calcProfit(v.asking_price, v.cost_price)! >= 0 ? "text-success" : "text-danger"}`}
                          >
                            {formatJpy(calcProfit(v.asking_price, v.cost_price))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Inventory age & supplier */}
                    {v.status !== "sold" && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                        <span>在庫 {calcDaysInStock(v.acquisition_date, v.created_at)}日</span>
                        {v.supplier_name && <span>仕入先: {v.supplier_name}</span>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Link href={`/admin/market-vehicles/${v.id}`} className="btn-ghost px-3 py-1 text-xs">
                        詳細
                      </Link>
                      {v.status === "draft" && (
                        <button
                          type="button"
                          className="btn-danger px-3 py-1 text-xs"
                          disabled={deletingId === v.id}
                          onClick={() => handleDelete(v.id)}
                        >
                          {deletingId === v.id ? "削除中..." : "削除"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
