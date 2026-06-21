"use client";

/**
 * 一時プレビュー（design handoff の新規 UI を認証なしで一覧表示）。
 * ※ プレビュー専用。main には残さない。
 */
import { useState } from "react";
import Tabs from "@/components/ui/Tabs";
import AnchorBadge from "@/components/ui/AnchorBadge";
import Stepper from "@/components/ui/Stepper";
import Timeline from "@/components/ui/Timeline";
import PhotoCompare from "@/components/ui/PhotoCompare";
import GanttBoard from "@/components/admin/gantt/GanttBoard";

const svg = (label: string, c1: string, c2: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='640' height='360' fill='url(%23g)'/><text x='50%' y='50%' font-family='sans-serif' font-size='44' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`,
  )}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-micro text-muted">{title}</div>
      <div className="rounded-[var(--radius-lg)] border border-border-default bg-surface p-5 shadow-[var(--shadow-sm)]">
        {children}
      </div>
    </section>
  );
}

export default function PreviewPage() {
  const [tab, setTab] = useState("process");

  const emptyGantt = { staff: [], cases: [], unassigned: [], isDemo: false, dateLabel: "", staffCount: 0 };

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header className="space-y-2">
        <div className="text-micro text-muted">DESIGN HANDOFF · PREVIEW</div>
        <h1 className="text-h1 text-primary">Ledra Design System プレビュー</h1>
        <p className="text-body text-secondary">
          WORKSTREAM A〜D の新規 UI を認証なしで表示。<span className="text-accent-gold-text">Gold 差し色</span> は
          「信頼と格式」の特別な瞬間のみ。
        </p>
      </header>

      {/* WS-A: タイポ/トークン */}
      <Section title="WS-A — Type Ramp / Tokens">
        <div className="space-y-2">
          <div className="text-h1 text-primary">見出し H1 — ページタイトル</div>
          <div className="text-h2 text-primary">見出し H2 — セクション</div>
          <div className="text-h3 text-primary">見出し H3 — カード</div>
          <div className="text-body text-secondary">本文 body — 14 / 1.6。読みやすさ重視の標準テキスト。</div>
          <div className="text-small text-muted">補足 small — 12.5。メタ情報。</div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="rounded-[var(--radius-full)] bg-accent px-3 py-1 text-xs font-medium text-white">
              accent
            </span>
            <span className="rounded-[var(--radius-full)] bg-accent-gold-dim px-3 py-1 text-xs font-semibold text-accent-gold-text">
              accent-gold
            </span>
            <span className="font-mono text-sm text-primary">¥1,234,567 · MONO-0xAB12</span>
          </div>
        </div>
      </Section>

      {/* WS-B: Tabs */}
      <Section title="WS-B — Tabs（下線=文字幅 / 件数バッジ）">
        <Tabs
          tabs={[
            { key: "overview", label: "概要" },
            { key: "process", label: "工程", count: 5 },
            { key: "estimate", label: "見積", count: 2 },
            { key: "photos", label: "写真", count: 12 },
            { key: "memo", label: "メモ" },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="セクション"
        />
        <div className="pt-4 text-small text-muted">選択中: {tab}</div>
      </Section>

      {/* WS-D P0: AnchorBadge */}
      <Section title="WS-D P0 — AnchorBadge（Gold 差し色の主用途）">
        <AnchorBadge
          txHash="0x1234567890abcdef1234567890abcdef12345678"
          network="polygon"
          anchoredAt="2026-06-20T10:30:00+09:00"
        />
      </Section>

      {/* WS-D P1: Stepper */}
      <Section title="WS-D P1 — Stepper（証明書発行ウィザード）">
        <Stepper
          steps={[{ label: "車両" }, { label: "施工" }, { label: "写真" }, { label: "署名" }, { label: "発行" }]}
          current={2}
        />
      </Section>

      {/* WS-D P1: Timeline */}
      <Section title="WS-D P1 — Timeline（工程履歴）">
        <Timeline
          items={[
            { label: "受付", timestamp: "09:10", status: "done" },
            { label: "部品手配", timestamp: "09:40", status: "done" },
            { label: "施工中", timestamp: "11:00", status: "current", description: "PPF 貼り込み 3/5" },
            { label: "検収", status: "upcoming" },
            { label: "引渡", status: "upcoming" },
            { label: "証明書発行", status: "upcoming" },
          ]}
        />
      </Section>

      {/* WS-D P1: PhotoCompare */}
      <Section title="WS-D P1 — PhotoCompare（施工前後）">
        <PhotoCompare beforeSrc={svg("BEFORE", "#334155", "#0f172a")} afterSrc={svg("AFTER", "#b08d3f", "#7a5d28")} />
      </Section>

      {/* WS-C: Gantt（デモデータ） */}
      <Section title="WS-C — メカニック稼働ガント（デモデータ）">
        <GanttBoard realData={emptyGantt} dateStr="2026-06-20" />
      </Section>
    </div>
  );
}
