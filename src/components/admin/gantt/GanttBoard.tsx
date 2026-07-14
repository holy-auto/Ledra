"use client";

import { useEffect, useState } from "react";
import {
  type GanttData,
  type GanttKind,
  SHIFT_START,
  SHIFT_END,
  SLOTS_PER_HR,
  SLOT_W,
  GRID_W,
  hourToX,
  formatHour,
  capacityOf,
  nowHoursJst,
  layoutLanes,
  demoGanttData,
} from "@/lib/gantt/board";

/** 工程ドメイン → トークン CSS 変数（WORKSTREAM A のドメイン色を流用）。 */
const KIND: Record<GanttKind, { accent: string; text: string; dim: string; label: string }> = {
  work: { accent: "var(--accent-blue)", text: "var(--accent-blue-text)", dim: "var(--accent-blue-dim)", label: "施工" },
  cert: { accent: "var(--accent-gold)", text: "var(--accent-gold-text)", dim: "var(--accent-gold-dim)", label: "検収" },
  parts: {
    accent: "var(--accent-amber)",
    text: "var(--accent-amber-text)",
    dim: "var(--accent-amber-dim)",
    label: "部品待ち",
  },
  insure: {
    accent: "var(--accent-violet)",
    text: "var(--accent-violet-text)",
    dim: "var(--accent-violet-dim)",
    label: "損保",
  },
};

const ROW_LABEL_W = 200;
const UNASSIGN_W = 200;
const LANE_H = 46;

interface GanttBoardProps {
  realData: GanttData;
  dateStr: string;
  /** ケースバーの「確認して次へ進める」から呼ぶ。ジョブ詳細と同じ POST .../advance を実行する。 */
  onAdvance?: (reservationId: string) => Promise<void>;
}

export default function GanttBoard({ realData, dateStr, onAdvance }: GanttBoardProps) {
  const realEmpty = realData.cases.length === 0 && realData.unassigned.length === 0 && realData.staff.length === 0;
  // デモ表示は「ユーザが明示トグルしていなければ realEmpty に追従」する純導出。
  // これにより live ポーリングで空→実データに変わると自動でデモを抜け、ユーザが
  // 明示トグルした場合 (override 非 null) はその選択を尊重する。effect 不要。
  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
  const showDemo = demoOverride ?? realEmpty;
  const data = showDemo ? demoGanttData(dateStr) : realData;

  // ケースバーをクリックすると出す「確認して次へ進める」パネル。
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceErr, setAdvanceErr] = useState<string | null>(null);
  const activeCase = data.cases.find((c) => c.id === activeCaseId) ?? null;

  async function handleAdvance() {
    if (!activeCase || !onAdvance) return;
    setAdvancing(true);
    setAdvanceErr(null);
    try {
      await onAdvance(activeCase.id);
      setActiveCaseId(null);
    } catch (e) {
      setAdvanceErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancing(false);
    }
  }

  // NOW ライン: 開きっぱなしの運用ディスプレイでも現在時刻に追従するよう毎分更新。
  const [nowH, setNowH] = useState(() => nowHoursJst());
  useEffect(() => {
    const id = setInterval(() => setNowH(nowHoursJst()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowVisible = nowH >= SHIFT_START && nowH <= SHIFT_END;
  const nowX = hourToX(nowH);

  const hours: number[] = [];
  for (let h = SHIFT_START; h < SHIFT_END; h++) hours.push(h);

  // 行ごとにレーン割当と高さを事前計算（ラベル列とグリッド列で共有して高さを揃える）。
  const rows = data.staff.map((s) => {
    const mine = data.cases.filter((c) => c.staffIds.includes(s.id));
    const { items, laneCount } = layoutLanes(mine);
    const rowH = Math.max(80, laneCount * LANE_H + 12);
    return { staff: s, items, laneCount, rowH, pct: capacityOf(s.id, data.cases) };
  });

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border-default bg-surface shadow-[var(--shadow-md)]">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-default px-4 py-3">
        <span className="font-mono text-sm font-semibold text-primary">{data.dateLabel}</span>
        <span className="text-xs text-muted">{data.staffCount} 名稼働 · 08:00–19:00 · 30分</span>
        <span className="hidden h-4 w-px bg-border-default sm:block" />
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(KIND) as GanttKind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span
                className="inline-block h-2 w-3.5 rounded-[2px]"
                style={{
                  background: KIND[k].dim,
                  boxShadow: `inset 0 0 0 1px ${KIND[k].accent}`,
                  borderLeft: `2px solid ${KIND[k].accent}`,
                }}
              />
              {KIND[k].label}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {realEmpty && <span className="text-[11px] text-muted">本日の予約なし</span>}
          <button
            type="button"
            onClick={() => setDemoOverride(!showDemo)}
            aria-pressed={showDemo}
            className={`rounded-[var(--radius-full)] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showDemo
                ? "border-accent-gold/40 bg-accent-gold-dim text-accent-gold-text"
                : "border-border-strong text-muted hover:text-primary"
            }`}
          >
            デモデータ {showDemo ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0">
        {/* unassigned column (fixed) */}
        <div className="flex shrink-0 flex-col border-r border-border-default bg-base" style={{ width: UNASSIGN_W }}>
          <div className="flex h-8 items-center gap-2 border-b border-border-default bg-inset px-3">
            <span className="text-micro text-muted">未アサイン</span>
            <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[9.5px] font-semibold text-inverse">
              {data.unassigned.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-2.5">
            {data.unassigned.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-border-default px-2.5 py-3 text-center text-[11px] text-muted">
                未アサインなし
              </div>
            ) : (
              data.unassigned.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-1 rounded-[var(--radius-sm)] bg-surface px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--border-default)]"
                  style={{ borderLeft: `3px solid ${KIND[c.kind].accent}` }}
                >
                  <span
                    className="inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{ background: KIND[c.kind].dim, color: KIND[c.kind].text }}
                  >
                    {KIND[c.kind].label}
                  </span>
                  <span className="text-xs font-semibold text-primary">{c.label}</span>
                  <span className="text-[10.5px] text-muted">
                    {c.sub} · {c.tag}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {data.staff.length === 0 ? (
          <div className="flex-1 px-4 py-10 text-center text-sm text-muted">表示できるスタッフがいません</div>
        ) : (
          <div className="flex min-w-0 flex-1">
            {/* staff labels (fixed left column) */}
            <div className="shrink-0 border-r border-border-default" style={{ width: ROW_LABEL_W }}>
              <div className="flex h-8 items-center bg-inset px-3">
                <span className="text-micro text-muted">スタッフ</span>
                <span className="ml-auto font-mono text-[10px] text-muted">稼働率</span>
              </div>
              {rows.map(({ staff: s, rowH, pct }) => {
                const capColor =
                  pct >= 90
                    ? "var(--accent-red)"
                    : pct >= 70
                      ? "var(--accent-amber)"
                      : pct >= 30
                        ? "var(--accent-blue)"
                        : "var(--text-muted)";
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 border-b border-border-default bg-surface px-3"
                    style={{ height: rowH }}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                      {s.initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-primary">{s.name}</div>
                      <div className="truncate text-[10.5px] text-muted">{s.sub}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-inset">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: capColor }} />
                        </div>
                        <span className="min-w-[26px] text-right font-mono text-[9.5px] text-muted">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* single horizontal scroller: header + grid rows stay aligned */}
            <div className="flex-1 overflow-x-auto">
              <div style={{ width: GRID_W }}>
                {/* hour header */}
                <div className="flex h-8 border-b border-border-default bg-inset">
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="flex items-center border-r border-border-default px-2"
                      style={{ width: SLOTS_PER_HR * SLOT_W }}
                    >
                      <span className="font-mono text-[10.5px] font-medium text-muted">
                        {String(h).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>

                {/* rows */}
                {rows.map(({ staff: s, items, laneCount, rowH }, i) => {
                  const laneH = (rowH - 12) / laneCount;
                  return (
                    <div
                      key={s.id}
                      className="relative border-b border-border-default"
                      style={{ height: rowH, background: i % 2 ? "var(--bg-surface-solid)" : "var(--bg-inset)" }}
                    >
                      {/* hour lines */}
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0 w-px"
                          style={{ left: hourToX(h), background: "var(--border-default)" }}
                        />
                      ))}
                      {/* case bars (lane-stacked) */}
                      {items.map((c) => {
                        const left = hourToX(c.start) + 3;
                        const width = Math.max(28, hourToX(c.end) - hourToX(c.start) - 6);
                        const height = laneH - 4;
                        const top = 6 + c.lane * laneH;
                        const k = KIND[c.kind];
                        const compact = height < 58;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setAdvanceErr(null);
                              setActiveCaseId(c.id);
                            }}
                            title={`${c.label} · ${c.sub}\n${formatHour(c.start)}–${formatHour(c.end)} · ${c.tag} · ${c.prog}%\nクリックで確認`}
                            className="absolute flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-sm)] px-2 py-1 text-left transition-shadow hover:brightness-105"
                            style={{
                              left,
                              top,
                              width,
                              height,
                              background: k.dim,
                              boxShadow:
                                activeCaseId === c.id ? `0 0 0 2px ${k.accent}` : `inset 0 0 0 1px ${k.accent}`,
                              borderLeft: `3px solid ${k.accent}`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate text-[12px] font-semibold text-primary">{c.label}</span>
                              <span className="shrink-0 font-mono text-[9.5px] font-semibold" style={{ color: k.text }}>
                                {formatHour(c.start)}–{formatHour(c.end)}
                              </span>
                            </div>
                            {!compact && (
                              <div className="truncate text-[10.5px] text-muted">
                                {c.sub} · {c.tag}
                              </div>
                            )}
                            <div className="mt-auto flex items-center gap-2">
                              <div
                                className="h-[3px] flex-1 overflow-hidden rounded-full"
                                style={{ background: "var(--border-default)" }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${c.prog}%`, background: k.accent }}
                                />
                              </div>
                              {!compact && (
                                <span className="font-mono text-[9.5px] font-semibold" style={{ color: k.text }}>
                                  {c.prog}%
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {/* now line */}
                      {nowVisible && (
                        <div
                          className="absolute top-0 bottom-0 z-[2] w-px"
                          style={{ left: nowX, borderLeft: "1px dashed var(--accent-red)", opacity: 0.85 }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 確認パネル: ケースバークリックで開く。ジョブ詳細と同じ「確認して次へ進める」を盤面からも実行できる。 */}
      {activeCase && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface p-4 shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-primary">{activeCase.label}</div>
                <div className="text-xs text-muted">
                  {activeCase.sub} · {activeCase.tag} · 進捗 {activeCase.prog}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCaseId(null)}
                className="text-muted hover:text-primary"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            {advanceErr && <div className="mt-2 text-xs text-danger-text">{advanceErr}</div>}
            <div className="mt-3 flex justify-end gap-2">
              {activeCase.status !== "completed" && activeCase.status !== "cancelled" && onAdvance && (
                <button
                  type="button"
                  onClick={handleAdvance}
                  disabled={advancing}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  {advancing ? "更新中..." : "確認して次へ進める →"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
