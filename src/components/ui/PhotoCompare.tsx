"use client";

import { useState } from "react";

/**
 * PhotoCompare — 施工前/後の対比（汎用・design-system プリミティブ）。
 *
 * 既定はスライダー（ドラッグで before/after の境界を移動）。トグルで並列表示に
 * 切替可能。証明書詳細などの「施工前後」表示で `BeforeAfterSlider` 等の ad-hoc
 * 実装を統一するための土台。
 */
export default function PhotoCompare({
  beforeSrc,
  afterSrc,
  beforeLabel = "施工前",
  afterLabel = "施工後",
  alt = "施工前後比較",
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50); // after クリップ位置 (%)
  const [mode, setMode] = useState<"slider" | "split">("slider");

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1.5">
          <Tag tone="muted">{beforeLabel}</Tag>
          <Tag tone="accent">{afterLabel}</Tag>
        </div>
        <div className="inline-flex overflow-hidden rounded-[var(--radius-full)] border border-border-strong text-[11px]">
          <ModeButton active={mode === "slider"} onClick={() => setMode("slider")}>
            スライダー
          </ModeButton>
          <ModeButton active={mode === "split"} onClick={() => setMode("split")}>
            並列
          </ModeButton>
        </div>
      </div>

      {mode === "split" ? (
        <div className="grid grid-cols-2 gap-2">
          <Frame label={beforeLabel}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeSrc} alt={`${alt} (${beforeLabel})`} className="h-full w-full object-cover" />
          </Frame>
          <Frame label={afterLabel}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={afterSrc} alt={`${alt} (${afterLabel})`} className="h-full w-full object-cover" />
          </Frame>
        </div>
      ) : (
        <div className="relative select-none overflow-hidden rounded-[var(--radius-lg)] border border-border-default">
          {/* before (base) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeSrc} alt={`${alt} (${beforeLabel})`} className="block h-auto w-full object-cover" />
          {/* after (clipped overlay) */}
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={afterSrc}
              alt={`${alt} (${afterLabel})`}
              className="absolute inset-0 h-full max-w-none object-cover"
              style={{ width: `${10000 / pos}%` }}
            />
          </div>
          {/* handle line */}
          <div className="pointer-events-none absolute inset-y-0 w-px bg-surface" style={{ left: `${pos}%` }} />
          {/* range control */}
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="施工前後の比較位置"
            className="absolute inset-x-0 bottom-3 mx-auto block w-[92%] cursor-ew-resize accent-[color:var(--accent-blue)]"
          />
        </div>
      )}
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] border border-border-default bg-inset">
      {children}
      <span className="absolute left-2 top-2 rounded-[var(--radius-full)] bg-primary/80 px-2 py-0.5 text-[10px] font-semibold text-inverse">
        {label}
      </span>
    </div>
  );
}

function Tag({ tone, children }: { tone: "muted" | "accent"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] px-2 py-0.5 text-[10px] font-semibold ${
        tone === "accent" ? "bg-accent-dim text-accent-text" : "bg-inset text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-muted hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
