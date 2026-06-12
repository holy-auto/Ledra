"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import MutationGuard from "@/components/ui/MutationGuard";
import PageHeader from "@/components/ui/PageHeader";

// ─── 型定義 ──────────────────────────────────────────────────────
interface ShakenVehicle {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  shaken_expiry_date: string | null;
  reminder_sent_at: string | null;
  days_until_expiry: number | null;
  customer_name: string | null;
  customer_phone: string | null;
}

interface ShakenResponse {
  ok: boolean;
  today: string;
  days_ahead: number;
  vehicles: ShakenVehicle[];
}

type FilterTab = "soon" | "expired" | "all";

const DAYS_AHEAD_OPTIONS = [30, 60, 90, 180] as const;

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function vehicleLabel(v: ShakenVehicle): string {
  const parts = [v.maker, v.model, v.year].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

/** 残り日数の表示文字列 ("あとN日" / "N日超過" / "本日")。 */
function residualLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "本日";
  if (days > 0) return `あと${days}日`;
  return `${Math.abs(days)}日超過`;
}

/** 残り日数に応じた配色: ≤30=red, ≤60=orange, >60=muted, expired=red bold。 */
function residualClass(days: number | null): string {
  if (days == null) return "text-muted";
  if (days < 0) return "font-bold text-red-500";
  if (days <= 30) return "font-semibold text-red-500";
  if (days <= 60) return "font-semibold text-orange-500";
  return "text-muted";
}

/** 「期限間近 (0〜60日)」判定。 */
function isSoon(days: number | null): boolean {
  return (days ?? 999) >= 0 && (days ?? 999) <= 60;
}

/** 「期限切れ」判定。 */
function isExpired(days: number | null): boolean {
  return (days ?? 1) < 0;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function ShakenDashboardClient() {
  const [daysAhead, setDaysAhead] = useState<number>(60);
  const [tab, setTab] = useState<FilterTab>("soon");
  const [data, setData] = useState<ShakenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ updated: number; failed: string[] } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vehicles/shaken?days_ahead=${daysAhead}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as ShakenResponse;
      setData(json);
    } catch (e) {
      console.error(e);
      showToast("error", "車検データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  // daysAhead 変更時に再取得。fetchData は毎レンダー再生成されるため deps から除外する。
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysAhead]);

  // 派生値は React Compiler の自動メモ化に任せる (手動 useMemo は使わない)。
  const vehicles = data?.vehicles ?? [];
  const filtered =
    tab === "expired"
      ? vehicles.filter((v) => isExpired(v.days_until_expiry))
      : tab === "soon"
        ? vehicles.filter((v) => isSoon(v.days_until_expiry))
        : vehicles;
  const counts = {
    soon: vehicles.filter((v) => isSoon(v.days_until_expiry)).length,
    expired: vehicles.filter((v) => isExpired(v.days_until_expiry)).length,
    all: vehicles.length,
  };

  // 車検日更新 ------------------------------------------------------
  function startEdit(v: ShakenVehicle) {
    setEditingId(v.id);
    setEditDate(v.shaken_expiry_date ?? "");
  }

  async function saveEdit(vehicleId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vehicles/shaken", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, shaken_expiry_date: editDate || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? err.message ?? "更新に失敗しました");
      }
      showToast("success", "車検満了日を更新しました");
      setEditingId(null);
      await fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 一括入力 (plate_display,YYYY-MM-DD per line) ----------------------
  async function runBulk() {
    setBusy(true);
    setBulkResult(null);
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // plate_display → vehicle.id を解決 (現在ロード済みの一覧から)。
    const plateToId = new Map<string, string>();
    for (const v of vehicles) {
      if (v.plate_display) plateToId.set(v.plate_display.replace(/\s+/g, ""), v.id);
    }

    let updated = 0;
    const failed: string[] = [];
    for (const line of lines) {
      const commaIdx = line.lastIndexOf(",");
      if (commaIdx < 0) {
        failed.push(`${line} (区切り文字 , がありません)`);
        continue;
      }
      const plate = line.slice(0, commaIdx).trim().replace(/\s+/g, "");
      const date = line.slice(commaIdx + 1).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        failed.push(`${line} (日付は YYYY-MM-DD 形式)`);
        continue;
      }
      const vehicleId = plateToId.get(plate);
      if (!vehicleId) {
        failed.push(`${line} (ナンバー「${plate}」が一覧に見つかりません)`);
        continue;
      }
      try {
        const res = await fetch("/api/admin/vehicles/shaken", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicle_id: vehicleId, shaken_expiry_date: date }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          failed.push(`${line} (${err.error?.message ?? "更新失敗"})`);
          continue;
        }
        updated++;
      } catch {
        failed.push(`${line} (通信エラー)`);
      }
    }

    setBulkResult({ updated, failed });
    setBusy(false);
    if (updated > 0) await fetchData();
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        tag="車検管理"
        title="車検満了日管理"
        description="車検満了が近い車両を一覧表示し、満了日の更新・LINEリマインダーの送信状況を確認できます。"
        actions={
          <div className="flex items-center gap-3">
            <Link href="/admin/vehicles" className="btn-secondary">
              車両一覧
            </Link>
            <MutationGuard>
              <button onClick={() => setBulkOpen((o) => !o)} className="btn-primary">
                + 車検日を一括入力
              </button>
            </MutationGuard>
          </div>
        }
      />

      {/* フィルタ + days-ahead セレクタ */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "soon"} onClick={() => setTab("soon")}>
            期限間近 (≤60日) <CountBadge n={counts.soon} />
          </TabButton>
          <TabButton active={tab === "expired"} onClick={() => setTab("expired")}>
            期限切れ <CountBadge n={counts.expired} />
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            全件 <CountBadge n={counts.all} />
          </TabButton>
        </div>
        <label className="flex items-center gap-2 text-sm text-secondary">
          表示範囲
          <select value={daysAhead} onChange={(e) => setDaysAhead(Number(e.target.value))} className={inputCls}>
            {DAYS_AHEAD_OPTIONS.map((d) => (
              <option key={d} value={d}>
                今後{d}日
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 一括入力パネル */}
      {bulkOpen && (
        <div className="glass-card space-y-3 p-5">
          <div className="text-sm font-semibold text-primary">車検満了日の一括入力</div>
          <p className="text-xs text-muted">
            1行につき「ナンバー,YYYY-MM-DD」の形式で貼り付けてください (例: 品川330あ1234,2027-03-15)。
            ナンバーは現在の一覧に表示されている車両と照合します。
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"品川330あ1234,2027-03-15\n練馬500か5678,2026-12-01"}
            className={`${inputCls} w-full font-mono`}
          />
          <MutationGuard>
            <div className="flex items-center gap-3">
              <button onClick={runBulk} disabled={busy || !bulkText.trim()} className="btn-primary disabled:opacity-40">
                一括登録する
              </button>
              <button onClick={() => setBulkOpen(false)} className="btn-ghost">
                閉じる
              </button>
            </div>
          </MutationGuard>
          {bulkResult && (
            <div className="space-y-1 rounded-md bg-surface-hover p-3 text-xs">
              <div className="font-semibold text-success">{bulkResult.updated} 件を更新しました。</div>
              {bulkResult.failed.length > 0 && (
                <div className="space-y-0.5 text-red-500">
                  <div className="font-semibold">{bulkResult.failed.length} 件は失敗しました:</div>
                  {bulkResult.failed.map((f, i) => (
                    <div key={i}>・{f}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* テーブル */}
      <section className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">該当する車両がありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <Th>顧客名</Th>
                  <Th>車両</Th>
                  <Th>ナンバー</Th>
                  <Th>車検満了日</Th>
                  <Th>残り日数</Th>
                  <Th>最終リマインダー</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-surface-hover/60">
                    <td className="p-3 text-primary">{v.customer_name || "—"}</td>
                    <td className="p-3 text-secondary">{vehicleLabel(v)}</td>
                    <td className="p-3 font-mono text-secondary">{v.plate_display || "—"}</td>
                    <td className="p-3 whitespace-nowrap text-primary">
                      {editingId === v.id ? (
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className={inputCls}
                        />
                      ) : (
                        v.shaken_expiry_date || "—"
                      )}
                    </td>
                    <td className={`p-3 whitespace-nowrap ${residualClass(v.days_until_expiry)}`}>
                      {residualLabel(v.days_until_expiry)}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted">{formatDateTime(v.reminder_sent_at)}</td>
                    <td className="p-3">
                      <MutationGuard>
                        {editingId === v.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(v.id)}
                              disabled={busy}
                              className="btn-primary px-3 py-1 text-xs disabled:opacity-40"
                            >
                              保存
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn-ghost px-3 py-1 text-xs">
                              取消
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(v)} className="btn-ghost px-3 py-1 text-xs">
                            車検日を更新
                          </button>
                        )}
                      </MutationGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ─────────────────────────────────────────────
function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">{children}</th>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-secondary hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-1 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-bold">{n}</span>;
}
