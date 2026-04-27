"use client";

import { useState } from "react";
import { ScrollReveal } from "./ScrollReveal";
import { LeadForm } from "./LeadForm";
import { track } from "@/lib/marketing/analytics";

export type Resource = {
  /** Stable key used as `resource_key` on the lead record */
  key: string;
  title: string;
  description: string;
  badge?: string;
  /**
   * Optional direct download URL. When set, the download is fetched via
   * blob right after lead submission so we can (a) time it, (b) track a
   * `document_download_completed` event on success, and (c) pass the lead
   * id back to the server for downloaded_at writeback.
   */
  downloadUrl?: string;
  pageCount?: number;
};

export function ResourceCard({ resource, delay = 0 }: { resource: Resource; delay?: number }) {
  const [open, setOpen] = useState(false);

  function openForm() {
    setOpen(true);
    track({
      name: "document_download_started",
      props: { resource_key: resource.key },
    });
  }

  async function onSubmitted(leadId: string) {
    if (!resource.downloadUrl || typeof window === "undefined") return;

    // Paint the success pane first, then fetch the blob.
    await new Promise((r) => setTimeout(r, 400));

    const url = `${resource.downloadUrl}${resource.downloadUrl.includes("?") ? "&" : "?"}lead=${encodeURIComponent(leadId)}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ms = Math.round(performance.now() - t0);

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${resource.key}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      track({
        name: "document_download_completed",
        props: { resource_key: resource.key, bytes: blob.size, ms },
      });
    } catch (err) {
      track({
        name: "document_download_failed",
        props: {
          resource_key: resource.key,
          reason: err instanceof Error ? err.message : "unknown",
        },
      });
      // Fallback to native navigation so the user still gets the PDF.
      window.location.href = url;
    }
  }

  return (
    <ScrollReveal variant="fade-up" delay={delay}>
      <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 md:p-8 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors flex flex-col">
        {resource.badge && (
          <span className="self-start inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[0.688rem] font-medium text-blue-300 mb-4">
            {resource.badge}
          </span>
        )}
        <h3 className="text-[1.125rem] md:text-[1.25rem] font-bold text-white leading-[1.4]">{resource.title}</h3>
        <p className="mt-3 text-[0.938rem] leading-[1.75] text-white/80 flex-1">{resource.description}</p>
        {resource.pageCount && <p className="mt-4 text-xs text-white/75">PDF · 約{resource.pageCount}ページ</p>}
        <button
          type="button"
          onClick={openForm}
          className="mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] transition-all self-start"
        >
          無料でダウンロード
        </button>

        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${resource.title} のダウンロード申請`}
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-10 md:pt-20"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0b111c] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
              <div className="flex items-start justify-between p-6 border-b border-white/[0.06]">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-blue-300">資料ダウンロード</p>
                  <h4 className="mt-2 text-lg font-bold text-white leading-snug">{resource.title}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-white/75 hover:bg-white/[0.06] hover:text-white"
                  aria-label="閉じる"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <LeadForm
                  source="document_dl"
                  resourceKey={resource.key}
                  fields={{ phone: true, industry: true, locations: true }}
                  labels={{ submit: "資料をダウンロード" }}
                  success={{
                    title: "ダウンロードを開始しました",
                    body: "ダウンロードリンクをメールでもお送りしました。\nご確認いただけますと幸いです。",
                  }}
                  onSubmitted={onSubmitted}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollReveal>
  );
}
