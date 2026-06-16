"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

type TargetRow = { year_month: string; target_amount: number };
type Progress = { month: string; target: number; actual: number; achievementRate: number | null };

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function jpLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}年${parseInt(m[2], 10)}月` : key;
}

export default function SalesTargetsClient() {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const currentKey = monthKey(new Date());

  // 表示する月: 翌月 → 過去 11 ヶ月（降順）+ 保存済みで窓外のもの
  const months = useMemo(() => {
    const now = new Date();
    const set = new Set<string>();
    for (let i = 1; i >= -11; i--) set.add(monthKey(addMonths(now, i)));
    for (const k of Object.keys(saved)) set.add(k);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [saved]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sales-targets", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j) {
        const targets: TargetRow[] = j.targets ?? [];
        const map: Record<string, number> = {};
        const amt: Record<string, string> = {};
        for (const t of targets) {
          map[t.year_month] = t.target_amount;
          amt[t.year_month] = String(t.target_amount);
        }
        setSaved(map);
        setAmounts(amt);
        setProgress((j.progress as Progress | null) ?? null);
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    setMsg(null);
    const raw = amounts[key] ?? "";
    const amount = Math.max(0, Math.floor(Number(raw) || 0));
    try {
      const res = await fetch("/api/admin/sales-targets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year_month: key, target_amount: amount }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSaved((prev) => ({ ...prev, [key]: amount }));
      setAmounts((prev) => ({ ...prev, [key]: String(amount) }));
      // 当月を更新したら進捗も取り直す
      if (key === currentKey) {
        const pRes = await fetch("/api/admin/sales-targets", { cache: "no-store" });
        const pJ = await parseJsonSafe(pRes);
        if (pRes.ok && pJ) setProgress((pJ.progress as Progress | null) ?? null);
      }
      setMsg({ text: `${jpLabel(key)}の目標を保存しました`, ok: true });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="text-sm text-muted">読み込み中…</div>;

  const target = progress?.target ?? 0;
  const actual = progress?.actual ?? 0;
  const rate = progress?.achievementRate ?? (target > 0 ? Math.round((actual / target) * 1000) / 10 : null);
  const barPct = Math.min(100, Math.max(0, rate ?? 0));
  const reached = (rate ?? 0) >= 100;

  return (
    <div className="space-y-6">
      {/* 当月の進捗 */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">
            {progress?.month ? jpLabel(progress.month) : "今月"}の達成状況
          </div>
          {target > 0 && (
            <div className={`text-sm font-bold ${reached ? "text-success" : "text-accent"}`}>{rate ?? 0}%</div>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-3xl font-bold text-primary">¥{actual.toLocaleString()}</div>
          <div className="text-sm text-muted">{target > 0 ? `/ ¥${target.toLocaleString()}` : "（目標未設定）"}</div>
        </div>
        {target > 0 && (
          <div className="mt-3 h-2 rounded-full bg-surface-active overflow-hidden">
            <div
              className={`h-full rounded-full ${reached ? "bg-gradient-to-r from-success to-emerald-500" : "bg-gradient-to-r from-accent to-violet-500"}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">
          実績 = 当月に計上された入金済みの請求書・領収書（経営分析の入金額と同じ定義）。
        </p>
      </div>

      {/* 月次目標の入力 */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-primary mb-3">月次の売上目標</h2>
        <div className="space-y-2">
          {months.map((key) => {
            const isCurrent = key === currentKey;
            const dirty = (amounts[key] ?? "") !== (saved[key] != null ? String(saved[key]) : "");
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isCurrent ? "bg-accent-dim" : "bg-surface-hover"}`}
              >
                <div className="w-28 text-sm text-secondary">
                  {jpLabel(key)}
                  {isCurrent && <span className="ml-1 text-[10px] text-accent">今月</span>}
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-sm text-muted">¥</span>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    inputMode="numeric"
                    value={amounts[key] ?? ""}
                    placeholder="0"
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="input-field flex-1 max-w-[14rem]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSave(key)}
                  disabled={savingKey === key || !dirty}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40"
                >
                  {savingKey === key ? "保存中…" : "保存"}
                </button>
              </div>
            );
          })}
        </div>
        {msg && <div className={`mt-3 text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}
