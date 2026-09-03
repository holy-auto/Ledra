"use client";

import { useState, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Slide data                                                          */
/* ------------------------------------------------------------------ */

const SLIDES = [
  // 1 ─ Title
  {
    id: "title",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6">
        <div className="text-[10px] font-mono tracking-[0.3em] text-blue-400 uppercase mb-2">
          施工履歴プラットフォーム
        </div>
        <h1 className="text-7xl md:text-8xl font-bold tracking-tight text-white">Ledra</h1>
        <p className="text-2xl md:text-3xl text-white font-light">施工の証明を、デジタルで。</p>
        <div className="mt-8 w-16 h-px bg-blue-500/60" />
        <p className="text-white text-sm">← → キーまたはクリックでスライドを切り替え</p>
      </div>
    ),
  },

  // 2 ─ Problems
  {
    id: "problems",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-3xl mx-auto">
        <SectionLabel>業界の課題</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white leading-snug">
          自動車施工業界が
          <br />
          抱える 5 つの問題
        </h2>
        <ul className="flex flex-col gap-4 mt-2">
          {[
            "紙の証明書は紛失・劣化しやすく、管理が煩雑",
            "第三者が証明書の真正性をリアルタイムで確認できない",
            "予約・作業・証明書・請求がバラバラで何度も転記が必要",
            "保険会社への施工実績提出に時間がかかりすぎる",
            "施工店間での連携・受発注の手段がない",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3 text-white text-lg" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="mt-1 w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                <span className="text-red-400 text-xs">✕</span>
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    ),
  },

  // 3 ─ Solution
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-3xl mx-auto">
        <SectionLabel>Ledra の解決策</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white leading-snug">
          すべての課題を
          <br />
          Ledra が解決します
        </h2>
        <ul className="flex flex-col gap-4 mt-2">
          {[
            "QR コード付きデジタル証明書で永続的に管理・共有",
            "ブロックチェーンアンカリングで改ざん不可の真正性保証",
            "予約 → 作業 → 証明書 → 請求を 1 画面で完結",
            "保険会社専用ポータルで証明書を即座に検索・照会",
            "BtoB マーケットプレイスで施工店間の受発注を実現",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3 text-white text-lg">
              <span className="mt-1 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0">
                <span className="text-green-400 text-xs">✓</span>
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    ),
  },

  // 4 ─ Four portals
  {
    id: "portals",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-10 max-w-4xl mx-auto w-full">
        <SectionLabel>プラットフォーム構成</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          4 つのポータルで
          <br />
          全ユーザーをカバー
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              role: "Admin",
              label: "施工店",
              color: "blue",
              items: ["証明書発行", "予約管理", "請求・会計", "BtoB受発注"],
            },
            {
              role: "Agent",
              label: "代理店",
              color: "violet",
              items: ["紹介管理", "コミッション", "ランキング", "研修"],
            },
            {
              role: "Insurer",
              label: "保険会社",
              color: "cyan",
              items: ["証明書照会", "案件管理", "SLA管理", "分析"],
            },
            {
              role: "Customer",
              label: "顧客",
              color: "emerald",
              items: ["証明書閲覧", "QRアクセス", "PDF出力", "マイページ"],
            },
          ].map((p) => (
            <PortalCard key={p.role} {...p} />
          ))}
        </div>
      </div>
    ),
  },

  // 5 ─ Certificate flow
  {
    id: "certificate",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-10 max-w-4xl mx-auto w-full">
        <SectionLabel>主要機能 1</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          施工証明書の発行
          <br />
          <span className="text-blue-400">たった数ステップで完了</span>
        </h2>
        <div className="flex flex-col md:flex-row items-start gap-3">
          {[
            { step: "01", title: "車両登録", desc: "車検証 OCR で自動読取" },
            { step: "02", title: "施工・写真", desc: "施工内容と写真をアップロード" },
            { step: "03", title: "証明書発行", desc: "QR コードを自動生成" },
            { step: "04", title: "顧客共有", desc: "スマホで即閲覧・PDF出力" },
            { step: "05", title: "BC記録", desc: "Polygon で改ざん防止" },
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 text-xs font-mono">
                {s.step}
              </div>
              <div className="text-white font-semibold text-sm">{s.title}</div>
              <div className="text-white text-xs leading-tight">{s.desc}</div>
              {i < 4 && <div className="hidden md:block absolute" />}
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-5 text-white text-sm leading-relaxed">
          証明書には施工内容・写真・施工店情報が記録され、公開 URL から誰でも真正性を検証できます。
          ブロックチェーンに写真ハッシュをアンカリングすることで、デジタル改ざんを完全に防止します。
        </div>
      </div>
    ),
  },

  // 6 ─ Job workflow
  {
    id: "workflow",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-4xl mx-auto w-full">
        <SectionLabel>主要機能 2</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          案件ワークフロー
          <br />
          <span className="text-blue-400">予約から請求まで 1 画面</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {["予約確定", "来店", "作業中", "完了"].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="px-4 py-2 rounded-lg border text-sm font-medium"
                style={{
                  background: i === 3 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                  borderColor: i === 3 ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)",
                  color: i === 3 ? "rgb(134,239,172)" : "rgba(255,255,255,0.75)",
                }}
              >
                {s}
              </div>
              {i < 3 && <span className="text-white">→</span>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "🪪",
              title: "証明書発行",
              desc: "車両・顧客情報を自動引き継ぎ。重複発行防止機能付き",
            },
            {
              icon: "💰",
              title: "請求書作成",
              desc: "案件情報から自動反映。PDF 生成・共有リンク発行",
            },
            {
              icon: "🏃",
              title: "飛び込み案件",
              desc: "/jobs/new から数秒でワークフローに合流",
            },
          ].map((card) => (
            <div
              key={card.icon}
              className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-5 flex flex-col gap-2"
            >
              <div className="text-2xl">{card.icon}</div>
              <div className="text-white font-semibold">{card.title}</div>
              <div className="text-white text-sm leading-relaxed">{card.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 7 ─ Insurer portal
  {
    id: "insurer",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-3xl mx-auto w-full">
        <SectionLabel>主要機能 3</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          保険会社ポータル
          <br />
          <span className="text-cyan-400">証明書を即座に照会</span>
        </h2>
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.06] border border-white/[0.1] px-4 py-3">
            <span className="text-white">🔍</span>
            <span className="text-white text-sm">証明書番号 / 顧客名 / 車両ナンバーで検索…</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "証明書一括検索", icon: "📄" },
              { label: "案件管理", icon: "📋" },
              { label: "SLA 自動管理", icon: "⏱️" },
              { label: "CSV / PDF 出力", icon: "📊" },
              { label: "自動振り分けルール", icon: "🤖" },
              { label: "ウォッチリスト", icon: "👁️" },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-white"
              >
                <span>{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
        </div>
        <p className="text-white text-sm leading-relaxed">
          保険金請求時の施工実績確認が、専用ポータルで数秒で完了。
          施工店とのコミュニケーションコストを大幅に削減します。
        </p>
      </div>
    ),
  },

  // 8 ─ BtoB
  {
    id: "btob",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-3xl mx-auto w-full">
        <SectionLabel>主要機能 4</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          BtoB マーケットプレイス
          <br />
          <span className="text-violet-400">施工店同士をつなぐ</span>
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.07] p-5">
              <div className="text-white font-semibold mb-1">施工店 A</div>
              <div className="text-white text-sm">得意分野・空き情報を掲載</div>
            </div>
            <div className="text-white text-2xl">⇄</div>
            <div className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.07] p-5">
              <div className="text-white font-semibold mb-1">施工店 B</div>
              <div className="text-white text-sm">検索・問い合わせ・発注</div>
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-5">
            <div className="flex flex-wrap gap-2">
              {["問い合わせ", "見積もり", "発注", "作業実施", "完了・レビュー", "パートナーランク反映"].map(
                (step, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-xs px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300">
                      {step}
                    </span>
                    {i < 5 && <span className="text-white text-xs">→</span>}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
        <p className="text-white text-sm leading-relaxed">
          パートナーランク（プラチナ / ゴールド / シルバー / ブロンズ）で実績が可視化され、
          信頼できる施工店との取引を促進します。
        </p>
      </div>
    ),
  },

  // 9 ─ Tech / integrations
  {
    id: "tech",
    render: () => (
      <div className="flex flex-col justify-center h-full gap-8 max-w-4xl mx-auto w-full">
        <SectionLabel>信頼の技術基盤</SectionLabel>
        <h2 className="text-4xl md:text-5xl font-bold text-white">
          エンタープライズ水準の
          <br />
          セキュリティと信頼性
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { name: "Stripe", desc: "安全な決済・サブスク管理", icon: "💳" },
            { name: "Supabase", desc: "PostgreSQL + RLS + Realtime", icon: "🗄️" },
            { name: "Polygon BC", desc: "施工写真ハッシュのアンカリング", icon: "⛓️" },
            { name: "C2PA", desc: "施工写真へのコンテンツクレデンシャル付与", icon: "🪪" },
            { name: "電子署名 (内製)", desc: "ECDSA P-256 ベースの自前署名", icon: "✍️" },
            { name: "2FA (TOTP)", desc: "Google Auth / 1Password 対応", icon: "🔐" },
          ].map((t) => (
            <div key={t.name} className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4 flex flex-col gap-2">
              <div className="text-xl">{t.icon}</div>
              <div className="text-white font-semibold text-sm">{t.name}</div>
              <div className="text-white text-xs leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {["Google Calendar", "LINE", "Resend", "Sentry", "Vercel", "Upstash Redis"].map((s) => (
            <span
              key={s}
              className="text-xs px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-white"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    ),
  },

  // 10 ─ CTA
  {
    id: "cta",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-8">
        <div className="text-[10px] font-mono tracking-[0.3em] text-blue-400 uppercase">今すぐ始めましょう</div>
        <h2 className="text-6xl md:text-7xl font-bold text-white">Ledra</h2>
        <p className="text-xl text-white max-w-md leading-relaxed">
          14 日間の無料トライアルで全機能をお試しいただけます。 クレジットカード不要。いつでもキャンセル可能。
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
          <a
            href="/signup"
            className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold text-lg"
          >
            無料で始める
          </a>
          <a
            href="/contact"
            className="px-8 py-4 rounded-xl border border-white/20 hover:border-white/40 transition-colors text-white font-semibold text-lg"
          >
            お問い合わせ
          </a>
        </div>
        <div className="mt-8 w-16 h-px bg-white/10" />
        <p className="text-white text-sm">ledra.jp</p>
      </div>
    ),
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-mono tracking-[0.25em] text-blue-400 uppercase">{children}</div>;
}

function PortalCard({ role, label, color, items }: { role: string; label: string; color: string; items: string[] }) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    blue: {
      bg: "rgba(59,130,246,0.12)",
      border: "rgba(59,130,246,0.3)",
      text: "rgb(147,197,253)",
    },
    violet: {
      bg: "rgba(139,92,246,0.12)",
      border: "rgba(139,92,246,0.3)",
      text: "rgb(196,181,253)",
    },
    cyan: {
      bg: "rgba(6,182,212,0.12)",
      border: "rgba(6,182,212,0.3)",
      text: "rgb(103,232,249)",
    },
    emerald: {
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.3)",
      text: "rgb(110,231,183)",
    },
  };
  const c = colorMap[color];
  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div>
        <div className="text-xs font-mono tracking-widest" style={{ color: c.text }}>
          {role}
        </div>
        <div className="text-white font-semibold mt-0.5">{label}</div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="text-xs text-white flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-current opacity-60" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

export default function VideoPresentation() {
  const [current, setCurrent] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= SLIDES.length) return;
    setCurrent(index);
    setAnimKey((k) => k + 1);
  }, []);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev]);

  const slide = SLIDES[current];

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: "#060a12", fontFamily: "var(--font-noto, sans-serif)" }}
      onClick={next}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Slide content */}
      <div
        key={animKey}
        className="relative z-10 w-full h-full px-12 md:px-24 py-16"
        style={{ animation: "fadeSlideIn 0.35s ease both" }}
      >
        {slide.render()}
      </div>

      {/* Progress dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              goTo(i);
            }}
            className="transition-all duration-200 rounded-full"
            style={{
              width: i === current ? "24px" : "6px",
              height: "6px",
              background: i === current ? "#3b82f6" : "rgba(255,255,255,0.25)",
            }}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div className="absolute top-6 right-8 text-white text-xs font-mono z-20">
        {current + 1} / {SLIDES.length}
      </div>

      {/* Nav arrows (visible on hover) */}
      {current > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-white hover:text-white transition-all"
          aria-label="前のスライド"
        >
          ‹
        </button>
      )}
      {current < SLIDES.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-white hover:text-white transition-all"
          aria-label="次のスライド"
        >
          ›
        </button>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
