"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Side = "top" | "bottom" | "left" | "right";

interface HelpTooltipProps {
  /** ツールチップに表示する説明文 (テキスト or リッチノード) */
  children: ReactNode;
  /** 表示位置。デフォルトは top。狭い場所では bottom にすると親要素を突き抜けにくい */
  side?: Side;
  /** ?アイコンの追加クラス */
  className?: string;
  /** スクリーンリーダー用ラベル */
  ariaLabel?: string;
}

/**
 * フォーム項目の隣に置く小さな「?」アイコン。
 * クリック / ホバーで詳細説明を表示し、もう一度クリック or 外クリックで閉じる。
 *
 * 使用例:
 *   <label>車体番号 (VIN) <HelpTooltip>車検証の右上に記載される17桁の英数字...</HelpTooltip></label>
 */
export default function HelpTooltip({
  children,
  side = "top",
  className = "",
  ariaLabel = "ヘルプ",
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  const sideCls: Record<Side, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span ref={wrapRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-active text-[10px] font-bold text-muted hover:bg-accent-dim hover:text-accent transition-colors cursor-help"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
      >
        ?
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute ${sideCls[side]} z-50 w-64 max-w-[80vw] rounded-lg border border-border-default bg-surface px-3 py-2 text-xs leading-relaxed text-primary shadow-lg`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
