"use client";

import { useMemo, useRef, useState } from "react";

/**
 * SlotCalendarGrid
 * ------------------------------------------------------------
 * ミツモア風の週グリッド。曜日(列) × 30分(行) のセルを
 * ドラッグ / タッチでなぞって受付スロットを一括作成・削除する。
 *
 *  - 空きセルをドラッグ → その範囲のスロットを作成（連続範囲は1枠に結合）
 *  - 受付中セルをドラッグ → その範囲を削除（必要なら分割）
 *  - 受付中セルをタップ → その枠をまるごと削除
 *  - 複数曜日にまたがってドラッグすると各曜日に同じ時間帯を一括作成
 *
 * 実際の状態更新は親（BookingSettingsClient）のコールバックに委ねる。
 */

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;
const STEP = 30; // 1セル = 30分

export type GridSlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  label?: string | null;
};

interface Props {
  /** 表示中（未削除）のスロット一覧 */
  slots: GridSlot[];
  /** 範囲作成: 指定曜日に [startMin, endMin) のスロットを作成（結合は親で処理） */
  onCreateRange: (day: number, startMin: number, endMin: number) => void;
  /** 範囲削除: 指定曜日の [startMin, endMin) を削除（分割は親で処理） */
  onEraseRange: (day: number, startMin: number, endMin: number) => void;
  /** タップ削除: 指定曜日の atMin を含む枠をまるごと削除 */
  onEraseSlotAt: (day: number, atMin: number) => void;
}

// "HH:MM" → 分。"24:00" は 1440。
function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function minToLabel(m: number): string {
  if (m >= 1440) return "24:00";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type Cell = { day: number; t: number };

export default function SlotCalendarGrid({ slots, onCreateRange, onEraseRange, onEraseSlotAt }: Props) {
  // 0時から24時まで表示するか（既定は 6:00〜22:00 のみ表示）
  const [showFull, setShowFull] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [dragStart, setDragStart] = useState<Cell | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Cell | null>(null);
  const [mode, setMode] = useState<"create" | "erase">("create");

  // 表示するセルのインデックス範囲（30分刻み, 0〜47）
  const firstIdx = showFull ? 0 : 12; // 6:00
  const lastIdx = showFull ? 47 : 43; // 22:00 まで（セル43 = 21:30-22:00）
  const visibleIndices = useMemo(() => {
    const arr: number[] = [];
    for (let i = firstIdx; i <= lastIdx; i++) arr.push(i);
    return arr;
  }, [firstIdx, lastIdx]);

  // 曜日ごとの被覆区間（分）
  const coverage = useMemo(() => {
    const map: Record<number, { s: number; e: number; active: boolean }[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };
    for (const sl of slots) {
      (map[sl.day_of_week] ??= []).push({
        s: toMin(sl.start_time),
        e: toMin(sl.end_time),
        active: sl.is_active !== false,
      });
    }
    return map;
  }, [slots]);

  const cellCover = (day: number, i: number) => {
    const m = i * STEP;
    return coverage[day]?.find((r) => r.s <= m && r.e >= m + STEP);
  };

  const inDragRect = (day: number, i: number) => {
    if (!dragStart || !dragCurrent) return false;
    const d0 = Math.min(dragStart.day, dragCurrent.day);
    const d1 = Math.max(dragStart.day, dragCurrent.day);
    const t0 = Math.min(dragStart.t, dragCurrent.t);
    const t1 = Math.max(dragStart.t, dragCurrent.t);
    return day >= d0 && day <= d1 && i >= t0 && i <= t1;
  };

  // ── ポインタ位置からセルを特定（タッチ移動にも対応） ──
  function cellFromPoint(x: number, y: number): Cell | null {
    const el = document.elementFromPoint(x, y);
    const c = el?.closest<HTMLElement>("[data-cell]");
    if (!c) return null;
    const day = Number(c.getAttribute("data-day"));
    const t = Number(c.getAttribute("data-t"));
    if (Number.isNaN(day) || Number.isNaN(t)) return null;
    return { day, t };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    try {
      wrapperRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setMode(cellCover(cell.day, cell.t) ? "erase" : "create");
    setDragStart(cell);
    setDragCurrent(cell);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell) setDragCurrent(cell);
  }

  function commit() {
    if (!dragStart || !dragCurrent) return;
    const d0 = Math.min(dragStart.day, dragCurrent.day);
    const d1 = Math.max(dragStart.day, dragCurrent.day);
    const t0 = Math.min(dragStart.t, dragCurrent.t);
    const t1 = Math.max(dragStart.t, dragCurrent.t);
    const isTap = dragStart.day === dragCurrent.day && dragStart.t === dragCurrent.t;

    for (let day = d0; day <= d1; day++) {
      if (mode === "create") {
        onCreateRange(day, t0 * STEP, (t1 + 1) * STEP);
      } else if (isTap) {
        onEraseSlotAt(day, t0 * STEP);
      } else {
        onEraseRange(day, t0 * STEP, (t1 + 1) * STEP);
      }
    }
  }

  function handlePointerUp() {
    if (dragStart && dragCurrent) commit();
    setDragStart(null);
    setDragCurrent(null);
  }

  function handlePointerCancel() {
    setDragStart(null);
    setDragCurrent(null);
  }

  return (
    <div className="space-y-3">
      {/* 操作ガイド + 表示トグル */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-secondary">
          グリッドを<strong className="text-primary">ドラッグ／タッチ</strong>して受付時間帯を選択。
          受付中のマスをタップすると削除します。
        </p>
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {showFull ? "営業時間帯のみ表示" : "0時から表示"}
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-xs text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-border-default bg-surface" />
          空き
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
          受付中
        </span>
      </div>

      {/* グリッド本体 */}
      <div className="overflow-x-auto rounded-xl border border-border-default">
        <div
          ref={wrapperRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="min-w-[480px] select-none"
          style={{
            touchAction: "none",
            display: "grid",
            gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))",
          }}
        >
          {/* ヘッダー行 */}
          <div className="sticky top-0 z-10 border-b border-border-default bg-inset" />
          {DAY_NAMES.map((name, dow) => (
            <div
              key={dow}
              className={`border-b border-l border-border-subtle bg-inset py-1.5 text-center text-xs font-bold ${
                dow === 0 ? "text-danger" : dow === 6 ? "text-accent" : "text-primary"
              }`}
            >
              {name}
            </div>
          ))}

          {/* タイム行 */}
          {visibleIndices.map((i) => {
            const isHour = i % 2 === 0;
            return (
              <div key={`row-${i}`} className="contents">
                {/* 時刻ラベル */}
                <div
                  className={`flex items-start justify-end pr-1.5 text-[10px] text-muted ${
                    isHour ? "border-t border-border-subtle" : ""
                  }`}
                  style={{ height: 20 }}
                >
                  {isHour ? minToLabel(i * STEP) : ""}
                </div>
                {/* 各曜日セル */}
                {DAY_NAMES.map((_, dow) => {
                  const cov = cellCover(dow, i);
                  const covered = !!cov;
                  const dim = cov ? cov.active === false : false;
                  const previewing = inDragRect(dow, i);
                  let bg = "bg-surface hover:bg-accent-dim/40";
                  if (covered) bg = dim ? "bg-muted/40" : "bg-accent";
                  if (previewing) {
                    bg = mode === "create" ? "bg-accent/60" : "bg-danger/50";
                  }
                  return (
                    <div
                      key={`${dow}-${i}`}
                      data-cell
                      data-day={dow}
                      data-t={i}
                      className={`border-l border-border-subtle ${isHour ? "border-t border-border-subtle" : ""} ${bg} cursor-pointer transition-colors`}
                      style={{ height: 20 }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
