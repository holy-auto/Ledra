"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Drawer from "@/components/ui/Drawer";
import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";
import { TOUR_DONE_KEY } from "./OnboardingTour";

const GUIDE_KEY_PREFIX = "ledra_guide_";

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const router = useRouter();
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const replayTour = () => {
    try {
      localStorage.removeItem(TOUR_DONE_KEY);
    } catch {
      /* noop */
    }
    onClose();
    router.push("/admin");
    // /admin にすでに居る場合 router.push は no-op になるのでリロードして tour を起動させる
    setTimeout(() => {
      if (window.location.pathname === "/admin") window.location.reload();
    }, 50);
  };

  const resetAllInlineGuides = () => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(GUIDE_KEY_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
      setResetMsg(`${keys.length} 個のガイドを再表示します。次回それぞれの画面で表示されます。`);
      setTimeout(() => setResetMsg(null), 4000);
    } catch {
      setResetMsg("リセットに失敗しました。");
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="操作ガイド">
      <div className="space-y-6">
        {/* Quick start */}
        <section className="rounded-xl border border-accent/30 bg-accent-dim/30 p-4 space-y-3">
          <div className="text-sm font-semibold text-primary flex items-center gap-2">
            <span aria-hidden>🚀</span>
            クイックスタート
          </div>
          <p className="text-xs text-muted leading-relaxed">
            初回ツアーをもう一度見たり、各画面のヒントを再表示したりできます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={replayTour} className="btn-primary text-xs px-3 py-1.5">
              ツアーを再生
            </button>
            <button type="button" onClick={resetAllInlineGuides} className="btn-secondary text-xs px-3 py-1.5">
              ヒントを再表示
            </button>
            <Link
              href="/guide"
              target="_blank"
              onClick={onClose}
              className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
            >
              共有用ガイドを開く
              <span aria-hidden>↗</span>
            </Link>
          </div>
          {resetMsg && <p className="text-xs text-success">{resetMsg}</p>}
        </section>

        {/* Guide groups */}
        {OPERATION_GUIDE_GROUPS.map((group) => (
          <section key={group.id} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">{group.label}</h3>
            <ul className="space-y-1.5">
              {group.guides.map((guide) => {
                const isOpen = openGuide === guide.id;
                return (
                  <li
                    key={guide.id}
                    className={`rounded-lg border transition-colors ${
                      isOpen ? "border-accent/40 bg-accent-dim/20" : "border-border-default bg-surface-hover/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGuide(isOpen ? null : guide.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="text-lg shrink-0" aria-hidden>
                        {guide.icon}
                      </span>
                      <span className="flex-1 text-sm font-medium text-primary">{guide.title}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border-subtle">
                        <ol className="space-y-2 mt-2">
                          {guide.steps.map((step, idx) => (
                            <li key={idx} className="flex gap-2.5">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold mt-0.5">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-primary">{step.title}</div>
                                <div className="text-[11px] text-muted leading-relaxed mt-0.5">{step.description}</div>
                              </div>
                            </li>
                          ))}
                        </ol>
                        {guide.href && (
                          <Link
                            href={guide.href}
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 mt-1 text-xs text-accent hover:underline"
                          >
                            この画面を開く →
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* Support link */}
        <section className="rounded-xl border border-border-default bg-surface-hover/30 p-4">
          <div className="text-sm font-semibold text-primary mb-1">解決しないときは</div>
          <p className="text-xs text-muted leading-relaxed mb-3">
            運営チームへ直接お問い合わせいただけます。チャット感覚でメッセージを送れます。
          </p>
          <Link href="/admin/support" onClick={onClose} className="btn-secondary text-xs px-3 py-1.5 inline-block">
            サポートを開く →
          </Link>
        </section>
      </div>
    </Drawer>
  );
}
