"use client";

import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { SERVICE_TYPES } from "@/lib/staff/skills";

type Booth = {
  id: string;
  name: string;
  booth_type: string | null;
  capacity: number;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  note: string | null;
};
type Assignment = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  booth_id: string | null;
};

type Draft = {
  id?: string;
  name: string;
  booth_type: string;
  capacity: number;
  is_active: boolean;
};

const EMPTY_DRAFT: Draft = { name: "", booth_type: "", capacity: 1, is_active: true };

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "来店",
  in_progress: "作業中",
  completed: "完了",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function typeLabel(t: string | null): string {
  if (!t) return "";
  return SERVICE_TYPES.find((s) => s.key === t)?.label ?? t;
}
function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}
/**
 * 同時に重なる予約の最大数（=ブース占有のピーク）を返す。
 * 連続（午前/午後など重ならない）予約は満杯と見なさない。時間未設定の予約は
 * 終日占有として全件に重ねてカウントする。
 */
function maxConcurrent(items: Assignment[]): number {
  const allDay = items.filter((a) => !a.start_time || !a.end_time).length;
  const events: Array<[string, number]> = [];
  for (const a of items) {
    if (a.start_time && a.end_time) {
      events.push([a.start_time, 1]);
      events.push([a.end_time, -1]);
    }
  }
  // 同時刻は終了(-1)を開始(+1)より先に処理し、隣接予約を重複と見なさない。
  events.sort((x, y) => (x[0] === y[0] ? x[1] - y[1] : x[0] < y[0] ? -1 : 1));
  let cur = 0;
  let peak = 0;
  for (const [, d] of events) {
    cur += d;
    if (cur > peak) peak = cur;
  }
  return allDay + peak;
}

export default function BoothsClient() {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [date, setDate] = useState<string>(todayStr());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/admin/booths?date=${d}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j) {
        setBooths(j.booths ?? []);
        setAssignments(j.assignments ?? []);
      }
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(date);
  }, [fetchData, date]);

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setMsg({ text: "ブース名は必須です", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      booth_type: draft.booth_type || null,
      capacity: draft.capacity,
      is_active: draft.is_active,
    };
    try {
      const res = await fetch("/api/admin/booths", {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDraft(null);
      setMsg({ text: "保存しました", ok: true });
      await fetchData(date);
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const removeBooth = async (b: Booth) => {
    if (!confirm(`「${b.name}」を削除しますか？（割当済みの予約からは外れます）`)) return;
    setMsg(null);
    try {
      const res = await fetch("/api/admin/booths", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: b.id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchData(date);
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    }
  };

  if (loading) return <div className="text-sm text-muted">読み込み中…</div>;

  const unassigned = assignments.filter((a) => !a.booth_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-secondary">稼働日</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayStr())}
            className="input-field w-44"
          />
        </div>
        {!draft && (
          <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} className="btn-primary text-sm px-4 py-2">
            + ブースを追加
          </button>
        )}
      </div>

      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</div>}

      {draft && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-primary">{draft.id ? "ブースを編集" : "ブースを追加"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-secondary">ブース名 *</label>
              <input
                className="input-field"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="PPFブース1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary">区分</label>
              <select
                className="input-field"
                value={draft.booth_type}
                onChange={(e) => setDraft({ ...draft, booth_type: e.target.value })}
              >
                <option value="">— 指定なし —</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary">同時収容台数</label>
              <input
                type="number"
                min={1}
                max={50}
                className="input-field w-28"
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-secondary self-end">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              稼働中
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveDraft} disabled={saving} className="btn-primary text-sm px-4 py-2">
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="btn-secondary text-sm px-4 py-2"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {booths.length === 0 && !draft ? (
        <div className="glass-card p-8 text-center text-sm text-muted">
          ブースがまだ登録されていません。「+ ブースを追加」から PPF・コーティング・磨き等のブースを登録できます。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {booths.map((b) => {
            const items = assignments.filter((a) => a.booth_id === b.id);
            const used = maxConcurrent(items); // 同時占有のピーク（連続予約は満杯扱いしない）
            const full = used >= b.capacity;
            return (
              <div key={b.id} className={`glass-card p-4 ${b.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{b.name}</span>
                      {b.booth_type && (
                        <span className="rounded-full bg-accent-dim px-2 py-0.5 text-[10px] text-accent">
                          {typeLabel(b.booth_type)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      収容 {b.capacity} 台 ・{" "}
                      <span className={full ? "text-warning" : "text-success"}>
                        同時 {used}/{b.capacity}
                      </span>
                      <span className="ml-1">（本日 {items.length} 件）</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          id: b.id,
                          name: b.name,
                          booth_type: b.booth_type ?? "",
                          capacity: b.capacity,
                          is_active: b.is_active,
                        })
                      }
                      className="text-[11px] text-secondary hover:underline"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBooth(b)}
                      className="text-[11px] text-red-500 hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {items.length === 0 ? (
                    <div className="text-[11px] text-muted">この日の割当はありません</div>
                  ) : (
                    items.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-md bg-surface-hover px-2 py-1 text-[11px]"
                      >
                        <span className="truncate text-primary">
                          {fmtTime(a.start_time)}
                          {a.end_time ? `–${fmtTime(a.end_time)}` : ""} {a.title ?? "案件"}
                        </span>
                        <span className="ml-2 shrink-0 text-muted">{STATUS_LABEL[a.status] ?? a.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 未割当の予約 */}
      {unassigned.length > 0 && (
        <div className="glass-card p-4">
          <div className="text-xs font-semibold text-primary mb-2">ブース未割当（{unassigned.length}件）</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((a) => (
              <span key={a.id} className="rounded-md bg-warning-dim px-2 py-1 text-[11px] text-warning">
                {fmtTime(a.start_time)} {a.title ?? "案件"}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            案件ワークフロー（案件詳細）の「ブース」ピッカーで割り当てると、ここに表示されます。
          </p>
        </div>
      )}
    </div>
  );
}
