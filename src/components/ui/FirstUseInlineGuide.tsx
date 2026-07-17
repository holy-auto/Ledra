"use client";

import { useState, useSyncExternalStore } from "react";

type Step = {
  title: string;
  description?: string;
};

interface FirstUseInlineGuideProps {
  /** localStorage に閉じた状態を保存するための一意キー (例: "vehicles_new") */
  storageKey: string;
  /** タイトル */
  title: string;
  /** 短い概要文（任意） */
  description?: string;
  /** 番号付きで表示される手順 (3〜4ステップ程度を想定) */
  steps: Step[];
  /** 配色トーン */
  tone?: "accent" | "info" | "warning";
}

const TONE_CLASS: Record<NonNullable<FirstUseInlineGuideProps["tone"]>, string> = {
  accent: "border-accent/50 bg-accent-dim/30",
  // "info" has no dedicated color family in this design system — Badge and
  // Toast's own "info" variants already reuse the accent/blue tokens, so
  // this does the same rather than referencing undefined --color-info(-dim).
  info: "border-accent/50 bg-accent-dim/30",
  warning: "border-warning/50 bg-warning-dim/30",
};

const KEY_PREFIX = "ledra_guide_";

// Module-level stable refs for useSyncExternalStore
const subscribeNoop = () => () => {};
const serverSnapshot = (): string | null => null;

function readStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 各ページの初回利用時にだけ表示する、閉じられるインラインガイド。
 *
 * 一度「×」を押すと localStorage に永続化され、以降そのページでは表示されない。
 * 説明資料を読まなくても、最低限「次に何を入力すれば良いか」が分かるよう、
 * 主要画面の上部に挿入する想定。
 *
 * 使用例:
 *   <FirstUseInlineGuide
 *     storageKey="vehicles_new"
 *     title="車両を登録するには"
 *     steps={[ ... ]}
 *   />
 */
export default function FirstUseInlineGuide({
  storageKey,
  title,
  description,
  steps,
  tone = "accent",
}: FirstUseInlineGuideProps) {
  const fullKey = `${KEY_PREFIX}${storageKey}`;
  // useSyncExternalStore で localStorage を読む。SSR は serverSnapshot=null を返すので、
  // 初回レンダーではバナー非表示。クライアント側で localStorage の値を反映する。
  const stored = useSyncExternalStore(subscribeNoop, () => readStorageItem(fullKey), serverSnapshot);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  if (stored || sessionDismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(fullKey, "1");
    } catch {
      // localStorage 不可の環境は無視 (このセッションだけ非表示にする)
    }
    setSessionDismissed(true);
  };

  return (
    <div className={`relative rounded-2xl border-l-4 p-4 sm:p-5 ${TONE_CLASS[tone]}`}>
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary transition-colors"
        aria-label="このガイドを閉じる"
        title="このガイドを閉じる"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M3 3 L11 11 M11 3 L3 11" strokeLinecap="round" />
        </svg>
      </button>

      <div className="pr-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base" aria-hidden>
            💡
          </span>
          <span className="text-sm font-semibold text-primary">{title}</span>
        </div>
        {description && <p className="text-xs text-muted leading-relaxed mb-3">{description}</p>}
      </div>

      <ol className="grid gap-2 sm:grid-cols-3 mt-2">
        {steps.map((step, idx) => (
          <li key={idx} className="flex gap-2.5 items-start">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold mt-0.5">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-primary leading-snug">{step.title}</div>
              {step.description && (
                <div className="mt-0.5 text-[11px] text-muted leading-relaxed">{step.description}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
