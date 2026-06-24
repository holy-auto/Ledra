"use client";

// ════════════════════════════════════════════════════════════
// Ledra Admin Prototype — L3 "L-Shell" (Sidebar + 二段バー)
//
// Faithful port of the adopted shell from the "L字シェル — サイドバー
// + トップバー 3案" design exploration (L3 = サイドバー + 細グローバル
// バー + ページバー). Ported into a first-class, CSP-safe Next.js client
// route so it can be reviewed on the preview / production deployment.
//
// Source files: lshell-frames.jsx (LShell3), lshell-pages.jsx /
// lshell-pages-2.jsx (page bodies), lshell-diff.jsx (final 5 tweaks),
// ledral3data.json (seed data). The demo theme (LEDRA_DEMO_THEME /
// _TOKENS) and the sidebar are reconstructed against the production
// design tokens in src/app/globals.css — no new colors are introduced.
//
// All data is fictional preview seed data (no Supabase).
// ════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type ReactElement, Fragment } from "react";
import "./ledra-prototype.css";

type Go = (route: string) => void;

// ── Design tokens → production globals.css ──────────────────
const c = {
  bg: "var(--bg-base)",
  surface: "var(--bg-surface-solid)",
  inset: "var(--bg-inset)",
  ink: "var(--text-primary)",
  ink2: "var(--text-secondary)",
  muted: "var(--text-muted)",
  line: "var(--border-default)",
  lineHair: "var(--border-subtle)",
  line2: "var(--border-strong)",
  blue: "var(--accent-blue)",
  blueText: "var(--accent-blue-text)",
  blueDim: "var(--accent-blue-dim)",
  gold: "var(--accent-gold)",
  goldText: "var(--accent-gold-text)",
  goldDim: "var(--accent-gold-dim)",
  emerald: "var(--accent-emerald)",
  emeraldText: "var(--accent-emerald-text)",
  emeraldDim: "var(--accent-emerald-dim)",
  amber: "var(--accent-amber)",
  amberText: "var(--accent-amber-text)",
  amberDim: "var(--accent-amber-dim)",
  red: "var(--accent-red)",
  redText: "var(--accent-red-text)",
  redDim: "var(--accent-red-dim)",
  inverse: "var(--text-inverse)",
};
const t = {
  radius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
  font: { mono: "var(--font-mono)", sans: "var(--font-sans)" },
  shadow: { sm: "var(--shadow-sm)" },
};

// ── Icons (Heroicons-style outline, 1.5 stroke) ─────────────
const ICON_PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  bell: '<path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',
  filter: '<path d="M3 4h18M6 12h12M10 20h4"/>',
  download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  user: '<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3m4 0v4m-7 0h3"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6l8-3z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M21 7h-5m5 0v5"/>',
  car: '<path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14m-14 0v6m14-6v6M7 17h0m10 0h0M5 17h14"/>',
  doc: '<path d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7l-5-4H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/>',
};

function Glyph({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }}
    />
  );
}

const Ico: Record<string, (p: { style?: CSSProperties }) => ReactElement> = Object.fromEntries(
  Object.keys(ICON_PATHS).map((n) => [n, ({ style }: { style?: CSSProperties }) => <Glyph name={n} style={style} />]),
);

// ── Typography + small primitives ───────────────────────────
function Mono({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontFamily: t.font.mono, ...style }}>{children}</span>;
}
function H1({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <h1
      style={{
        fontFamily: t.font.sans,
        fontSize: 30,
        fontWeight: 600,
        color: c.ink,
        letterSpacing: "-0.02em",
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}
function H2({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <h2
      style={{
        fontFamily: t.font.sans,
        fontSize: 18,
        fontWeight: 600,
        color: c.ink,
        letterSpacing: "-0.01em",
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}
function Eyebrow({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: t.font.mono,
        fontSize: 10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: c.muted,
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Btn({
  kind = "secondary",
  size,
  icon,
  children,
  onClick,
}: {
  kind?: "primary" | "secondary";
  size?: "sm";
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const primary = kind === "primary";
  return (
    <button
      onClick={onClick}
      style={{
        height: size === "sm" ? 30 : 34,
        padding: "0 12px",
        border: 0,
        borderRadius: t.radius.sm,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        background: primary ? c.blue : c.surface,
        color: primary ? c.inverse : c.ink,
        boxShadow: primary ? "none" : `inset 0 0 0 1px ${c.line}`,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function SecondaryBtn({ icon, children, onClick }: { icon?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30,
        padding: "0 10px",
        border: 0,
        background: "transparent",
        color: c.ink2,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        borderRadius: t.radius.sm,
        boxShadow: `inset 0 0 0 1px ${c.line}`,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

const TONE: Record<string, { fg: string; bg: string }> = {
  gold: { fg: c.goldText, bg: c.goldDim },
  blue: { fg: c.blueText, bg: c.blueDim },
  amber: { fg: c.amberText, bg: c.amberDim },
  emerald: { fg: c.emeraldText, bg: c.emeraldDim },
  red: { fg: c.redText, bg: c.redDim },
  muted: { fg: c.muted, bg: c.inset },
};
function StatusBadge({ kind, children }: { kind?: string; children: ReactNode }) {
  const tone = TONE[kind || ""] || TONE.muted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: tone.fg }} />
      {children}
    </span>
  );
}

// ── Global bar pieces ───────────────────────────────────────
function CmdK({ compact, onInset, onClick }: { compact?: boolean; onInset?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: compact ? 260 : 320,
        height: compact ? 30 : 34,
        padding: "0 12px",
        background: onInset ? c.surface : c.bg,
        borderRadius: t.radius.md,
        boxShadow: `inset 0 0 0 1px ${c.line}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: c.muted,
        fontSize: 12.5,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <Ico.search style={{ width: 14, height: 14 }} />
      検索 · 顧客 / 車両 / 証明書 ID
      <Mono
        style={{
          marginLeft: "auto",
          fontSize: 10,
          padding: "1px 5px",
          background: onInset ? c.bg : c.surface,
          borderRadius: 4,
        }}
      >
        ⌘K
      </Mono>
    </div>
  );
}

function CmdKModal({ go, onClose }: { go: Go; onClose: () => void }) {
  const [q, setQ] = useState("");
  const lower = q.toLowerCase();
  const match = (r: { id: string; cust: string; car: string }) =>
    r.id.toLowerCase().includes(lower) || r.cust.toLowerCase().includes(lower) || r.car.toLowerCase().includes(lower);
  const certHits = q ? CERT_ROWS.filter(match) : [];
  const caseHits = q ? CASE_ROWS.filter(match) : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "center",
        paddingTop: "20vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "60vh",
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          alignSelf: "flex-start",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${c.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Ico.search style={{ width: 16, height: 16, color: c.muted, flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="検索 · 顧客 / 車両 / 証明書 ID"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              color: c.ink,
              fontFamily: t.font.sans,
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {certHits.length === 0 && caseHits.length === 0 && q && (
            <div style={{ padding: "16px 20px", fontSize: 13, color: c.muted, textAlign: "center" }}>該当なし</div>
          )}
          {certHits.length > 0 && (
            <div>
              <div
                style={{
                  padding: "4px 16px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: c.muted,
                  textTransform: "uppercase" as const,
                }}
              >
                証明書
              </div>
              {certHits.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    go("cert:" + r.id);
                    onClose();
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    color: c.ink,
                  }}
                >
                  <Mono style={{ fontSize: 12, color: c.muted }}>{r.id}</Mono>
                  <span>{r.cust}</span>
                  <span style={{ color: c.muted, marginLeft: "auto", fontSize: 12 }}>{r.car}</span>
                </div>
              ))}
            </div>
          )}
          {caseHits.length > 0 && (
            <div>
              <div
                style={{
                  padding: "4px 16px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: c.muted,
                  textTransform: "uppercase" as const,
                }}
              >
                案件
              </div>
              {caseHits.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    go("job:" + r.id);
                    onClose();
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    color: c.ink,
                  }}
                >
                  <Mono style={{ fontSize: 12, color: c.muted }}>{r.id}</Mono>
                  <span>{r.cust}</span>
                  <span style={{ color: c.muted, marginLeft: "auto", fontSize: 12 }}>{r.car}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BellAvatar({ initial = "K" }: { initial?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button
        style={{
          position: "relative",
          width: 32,
          height: 32,
          border: 0,
          background: "transparent",
          color: c.ink2,
          cursor: "pointer",
          borderRadius: t.radius.sm,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ico.bell style={{ width: 18, height: 18 }} />
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: c.red,
            boxShadow: `0 0 0 2px ${c.surface}`,
          }}
        />
      </button>
      <div style={{ width: 1, height: 18, background: c.line }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: c.blue,
            color: c.inverse,
            fontSize: 11.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initial}
        </div>
        <span style={{ color: c.muted, marginLeft: 2, display: "inline-flex" }}>
          <Ico.chevD style={{ width: 16, height: 16 }} />
        </span>
      </div>
    </div>
  );
}

function Crumb({ items, go, routes }: { items: string[]; go: Go; routes?: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.muted, minWidth: 0 }}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span style={{ color: c.muted, opacity: 0.55, display: "inline-flex" }}>
              <Ico.chevR style={{ width: 14, height: 14 }} />
            </span>
          )}
          <span
            onClick={routes?.[i] ? () => go(routes[i]) : undefined}
            style={{
              color: i === items.length - 1 ? c.ink : c.muted,
              fontWeight: i === items.length - 1 ? 500 : 400,
              whiteSpace: "nowrap",
              cursor: routes?.[i] ? "pointer" : "default",
            }}
          >
            {it}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

// ── Sidebar (SidebarA, owner role) — section-sidebars.jsx ───
interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  gold?: boolean;
}
interface NavGroup {
  group: string | null;
  items: NavItem[];
}
const NAV: NavGroup[] = [
  {
    group: "概要",
    items: [
      { id: "dashboard", label: "ダッシュボード", icon: "grid" },
      { id: "cases", label: "予約 / 入庫", icon: "calendar", badge: 4 },
      { id: "analytics", label: "分析", icon: "chart" },
    ],
  },
  {
    group: "業務",
    items: [
      { id: "certs", label: "証明書", icon: "shield", badge: 3, gold: true },
      { id: "customers", label: "車両 / 顧客", icon: "car" },
      { id: "invoices", label: "請求書", icon: "doc", badge: 12 },
      { id: "inventory", label: "部品 / 在庫", icon: "box", badge: 1 },
    ],
  },
  {
    group: "外部連携",
    items: [
      { id: "insurance", label: "損保案件", icon: "shield", badge: 1 },
      { id: "portal", label: "顧客ポータル", icon: "user" },
    ],
  },
];
// detail routes map back to their list for the active highlight
const ACTIVE_MAP: Record<string, string> = { cert: "certs", job: "cases" };

function SidebarA({ go, active, width = 220 }: { go: Go; active: string; width?: number }) {
  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        height: "100%",
        background: c.surface,
        borderRight: `1px solid ${c.line}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "18px 20px 12px" }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={c.ink}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 4v13h12" />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: "0.01em", color: c.ink }}>ledra</span>
      </div>

      {/* workspace card */}
      <div
        style={{
          margin: "0 12px 8px",
          padding: "8px 10px",
          borderRadius: t.radius.md,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: t.radius.sm,
            background: c.ink,
            color: c.inverse,
            fontFamily: t.font.mono,
            fontSize: 10,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          YK
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: c.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            横浜ガレージ工房
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: c.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            整備認証 ＋ コーティング
          </div>
        </div>
        <span style={{ color: c.muted, display: "inline-flex" }}>
          <Ico.chevD style={{ width: 14, height: 14 }} />
        </span>
      </div>

      {/* nav */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {NAV.map((sec, i) => (
          <Fragment key={i}>
            {sec.group && (
              <div
                style={{
                  fontSize: 10,
                  color: c.muted,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "14px 10px 5px",
                }}
              >
                {sec.group}
              </div>
            )}
            {sec.items.map((it) => {
              const isActive = active === it.id;
              const accent = it.gold ? c.gold : c.blue;
              return (
                <button
                  key={it.id}
                  onClick={() => go(it.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: t.radius.sm,
                    cursor: "pointer",
                    textAlign: "left",
                    background: isActive ? c.bg : "transparent",
                    boxShadow: isActive ? `inset 0 0 0 1px ${c.line}` : "none",
                    color: isActive ? c.ink : c.ink2,
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <span style={{ color: isActive ? accent : c.muted, display: "inline-flex" }}>
                    <Glyph name={it.icon} style={{ width: 17, height: 17 }} />
                  </span>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.label}
                  </span>
                  {it.badge != null ? (
                    <span
                      style={{
                        fontFamily: t.font.mono,
                        fontSize: 10.5,
                        fontWeight: 600,
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: accent,
                        color: c.inverse,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {it.badge}
                    </span>
                  ) : isActive ? (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                  ) : null}
                </button>
              );
            })}
          </Fragment>
        ))}
      </nav>

      {/* footer user */}
      <div
        style={{
          borderTop: `1px solid ${c.lineHair}`,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: c.blue,
            color: c.inverse,
            fontSize: 11.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          K
        </div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: c.ink }}>河本 雄一</div>
          <div style={{ fontSize: 10.5, color: c.muted }}>オーナー</div>
        </div>
        <button
          onClick={() => go("settings")}
          style={{
            border: 0,
            background: "transparent",
            color: c.muted,
            cursor: "pointer",
            display: "inline-flex",
            padding: 4,
            borderRadius: t.radius.sm,
          }}
          title="設定"
        >
          <Ico.cog style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </aside>
  );
}

// ── L3 shell ────────────────────────────────────────────────
interface Tab {
  l: string;
  active?: boolean;
  badge?: number;
}
const DASH_TABS: Tab[] = [{ l: "今日", active: true }, { l: "今週" }, { l: "今月" }, { l: "四半期" }];

function LShell3({
  crumb = ["横浜ガレージ工房", "ダッシュボード"],
  crumbRoutes,
  pageTitle = "ダッシュボード",
  pageMeta,
  tabs = DASH_TABS,
  pageActions,
  go,
  active,
  onCmdK,
  bodyKey,
  children,
}: {
  crumb?: string[];
  crumbRoutes?: string[];
  pageTitle?: string;
  pageMeta?: ReactNode;
  tabs?: Tab[];
  pageActions?: ReactNode;
  go: Go;
  active: string;
  onCmdK?: () => void;
  bodyKey?: string;
  children?: ReactNode;
}) {
  // Include bodyKey (route) so navigating between two details with identical
  // tab labels (e.g. cert→cert via ⌘K) still resets the active tab.
  const resetKey = (bodyKey ?? "") + "::" + tabs.map((tb) => tb.l).join("|");
  const [activeTabIdx, setActiveTabIdx] = useState(() =>
    Math.max(
      0,
      tabs.findIndex((tb) => tb.active),
    ),
  );
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      const idx = tabs.findIndex((tb) => tb.active);
      setActiveTabIdx(idx >= 0 ? idx : 0);
    }
  }, [resetKey, tabs]);

  // Responsive drawer: below 880px the sidebar collapses into an overlay
  // opened from a hamburger in the global bar. Initialize to false for SSR
  // safety, then sync to the real viewport width on mount.
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const apply = () => {
      const mobile = window.innerWidth < 880;
      setIsMobile(mobile);
      // Never leave the drawer mounted once we return to the desktop layout.
      if (!mobile) setDrawerOpen(false);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  // Close the drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const goAndClose: Go = (r) => {
    setDrawerOpen(false);
    go(r);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: c.bg }}>
      {!isMobile && <SidebarA go={go} active={active} />}
      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.35)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: 248,
              zIndex: 9998,
              boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            }}
          >
            <SidebarA go={goAndClose} active={active} width={248} />
          </div>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* top thin global bar — 44px, sunk into bg-inset for the two-tier feel */}
        <div
          style={{
            height: 44,
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: c.bg,
            borderBottom: `1px solid ${c.line}`,
            flexShrink: 0,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="メニュー"
              style={{
                width: 32,
                height: 32,
                border: 0,
                background: "transparent",
                color: c.ink2,
                cursor: "pointer",
                borderRadius: t.radius.sm,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `inset 0 0 0 1px ${c.line}`,
              }}
            >
              <Ico.grid style={{ width: 16, height: 16 }} />
            </button>
          )}
          {!isMobile && <Crumb items={crumb} go={go} routes={crumbRoutes} />}
          <div style={{ flex: 1 }} />
          {isMobile ? (
            <button
              onClick={onCmdK}
              aria-label="検索"
              style={{
                width: 32,
                height: 32,
                border: 0,
                background: "transparent",
                color: c.ink2,
                cursor: "pointer",
                borderRadius: t.radius.sm,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `inset 0 0 0 1px ${c.line}`,
              }}
            >
              <Ico.search style={{ width: 16, height: 16 }} />
            </button>
          ) : (
            <CmdK compact onInset onClick={onCmdK} />
          )}
          <BellAvatar />
        </div>
        {/* page header bar — 60px, on surface */}
        <div
          style={{
            minHeight: 60,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            background: c.surface,
            borderBottom: `1px solid ${c.line}`,
            flexShrink: 0,
            // On mobile the whole lower bar scrolls horizontally so nothing
            // (tabs or primary actions) is hidden or compressed.
            ...(isMobile ? { overflowX: "auto" as const } : null),
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 0 }}>
            <H2 style={{ whiteSpace: "nowrap" }}>{pageTitle}</H2>
            {pageMeta}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 4,
              alignSelf: "stretch",
              flexShrink: 0,
            }}
          >
            {tabs.map((tab, i) => {
              const isActive = i === activeTabIdx;
              return (
                <div
                  key={i}
                  onClick={() => setActiveTabIdx(i)}
                  style={{
                    position: "relative",
                    padding: "0 12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? c.ink : c.ink2,
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.l}
                  {tab.badge != null ? (
                    isActive ? (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 999,
                          background: c.ink,
                          color: c.surface,
                          fontWeight: 600,
                          fontFamily: t.font.mono,
                        }}
                      >
                        {tab.badge}
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "0px 5px",
                          borderRadius: 999,
                          background: "transparent",
                          color: c.muted,
                          fontWeight: 600,
                          fontFamily: t.font.mono,
                          boxShadow: `inset 0 0 0 1px ${c.line2}`,
                        }}
                      >
                        {tab.badge}
                      </span>
                    )
                  ) : null}
                  {isActive && (
                    <span
                      style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        bottom: -1,
                        height: 2,
                        background: c.ink,
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {!isMobile && <div style={{ flex: 1 }} />}
          {/* Page actions include primary CTAs (新規…, 発行/承認 etc.) that are
              not duplicated elsewhere, so they render on mobile too — the whole
              bar scrolls horizontally rather than hiding them. */}
          {pageActions && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{pageActions}</div>
          )}
        </div>
        {/* keyed on the route so navigating (incl. detail→detail) remounts the
            body and resets its internal scroll position */}
        <main key={bodyKey} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Page bodies — ported from lshell-frames / lshell-pages(-2)
// ════════════════════════════════════════════════════════════
function LMain({ kpiOnly = false }: { kpiOnly?: boolean }) {
  const kpis = [
    { l: "売上 · 今月", v: "¥3.82M" },
    { l: "入庫案件", v: "42" },
    { l: "証明書発行", v: "38", g: true },
  ];
  return (
    <div
      style={{
        flex: 1,
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: c.bg,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {!kpiOnly && (
        <Fragment>
          <Eyebrow>本日のサマリー</Eyebrow>
          <H1 style={{ fontSize: 26, marginTop: -4 }}>おはようございます、河本さん</H1>
        </Fragment>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: c.line,
          borderRadius: t.radius.lg,
          overflow: "hidden",
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          marginTop: kpiOnly ? 0 : 6,
        }}
      >
        {kpis.map((k, i) => (
          <div key={i} style={{ background: c.surface, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: k.g ? c.goldText : c.muted, letterSpacing: "0.06em", fontWeight: 600 }}>
              {k.l}
            </div>
            <div
              style={{
                fontFamily: t.font.mono,
                fontSize: 22,
                fontWeight: 500,
                marginTop: 6,
                color: c.ink,
                letterSpacing: "-0.02em",
              }}
            >
              {k.v}
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 120 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: t.radius.lg,
            background: c.surface,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: c.muted,
            fontSize: 12,
          }}
        >
          <div style={{ textAlign: "center", opacity: 0.7 }}>
            <div
              style={{
                fontFamily: t.font.mono,
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              main content
            </div>
            <div style={{ fontSize: 11 }}>本日の入庫 · 注目の動き · etc.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CERT_ROWS = [
  {
    id: "CERT-2024-0142",
    cust: "田中 雅人",
    car: "ALPHARD ZWS35",
    svc: "コーティング 5層",
    st: "pending",
    dt: "2024/05/18",
  },
  {
    id: "CERT-2024-0141",
    cust: "佐々木 健司",
    car: "LEXUS RX 500h",
    svc: "PPF フルボンネット",
    st: "issued",
    dt: "2024/05/17",
  },
  {
    id: "CERT-2024-0140",
    cust: "株式会社 木野",
    car: "HIACE GDH206W",
    svc: "ウィンドウフィルム",
    st: "issued",
    dt: "2024/05/17",
  },
  {
    id: "CERT-2024-0139",
    cust: "横田 美紀",
    car: "CIVIC FL5",
    svc: "ラッピング (マットPPF)",
    st: "review",
    dt: "2024/05/16",
  },
  {
    id: "CERT-2024-0138",
    cust: "高橋 隆志",
    car: "PORSCHE 992 GT3",
    svc: "コーティング 7層",
    st: "issued",
    dt: "2024/05/16",
  },
  {
    id: "CERT-2024-0137",
    cust: "小野 結衣",
    car: "BMW M3 G80",
    svc: "PPF + コーティング",
    st: "issued",
    dt: "2024/05/15",
  },
  {
    id: "CERT-2024-0136",
    cust: "岸 文哉",
    car: "GR YARIS GXPA16",
    svc: "ラッピング",
    st: "archived",
    dt: "2024/05/14",
  },
];
const CERT_STATUS: Record<string, { l: string; tone: string }> = {
  pending: { l: "発行待ち", tone: "amber" },
  review: { l: "検収中", tone: "blue" },
  issued: { l: "公式", tone: "gold" },
  archived: { l: "完了", tone: "muted" },
};

function CertListPage({ go }: { go: Go }) {
  const cols = "180px 1.4fr 1.6fr 1.6fr 110px 100px 24px";
  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", background: c.bg, minWidth: 0, overflow: "hidden" }}
    >
      <div style={{ flex: 1, padding: "20px 28px 24px", minHeight: 0, overflow: "auto" }}>
        <div
          className="lp-table"
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              padding: "10px 18px",
              borderBottom: `1px solid ${c.line}`,
              fontSize: 10.5,
              fontWeight: 600,
              color: c.muted,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            <div>証明書 ID</div>
            <div>顧客</div>
            <div>車両</div>
            <div>施工内容</div>
            <div>状態</div>
            <div style={{ textAlign: "right" }}>入庫日</div>
            <div />
          </div>
          {CERT_ROWS.map((r, i) => {
            const stt = CERT_STATUS[r.st];
            return (
              <div
                key={i}
                onClick={() => go("cert:" + r.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  padding: "14px 18px",
                  alignItems: "center",
                  borderBottom: i < CERT_ROWS.length - 1 ? `1px solid ${c.lineHair}` : "none",
                  fontSize: 12.5,
                  color: c.ink,
                  cursor: "pointer",
                }}
              >
                <Mono style={{ fontSize: 12, color: c.ink }}>{r.id}</Mono>
                <div>{r.cust}</div>
                <div style={{ color: c.ink2 }}>{r.car}</div>
                <div style={{ color: c.ink2 }}>{r.svc}</div>
                <div>
                  <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>
                </div>
                <Mono style={{ fontSize: 11.5, color: c.muted, textAlign: "right" }}>{r.dt}</Mono>
                <div style={{ color: c.muted, display: "inline-flex", justifyContent: "flex-end" }}>
                  <Ico.dots style={{ width: 16, height: 16 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Derive the certificate body copy from the selected service so the detail
// page does not contradict the row's 施工内容. Order matters: composite and
// wrapping services must be classified before the PPF-only fallback.
function certServiceInfo(svc: string): { desc: string; material: string; area: string; hours: string } {
  const hasPPF = svc.includes("PPF") || svc.includes("プロテ");
  const hasCoat = svc.includes("コーティング");
  const layerMatch = svc.match(/(\d+)\s*層/);
  const layers = layerMatch ? layerMatch[1] : "5";

  if (svc.includes("ラッピング")) {
    return {
      desc: "カーラッピング施工。脱脂・採寸の上、対象パネルへラップフィルムを貼り込み、エッジ処理・熱定着で仕上げ。",
      material: "Ledra Wrap",
      area: "ボディ全面",
      hours: "9.0h",
    };
  }
  if (hasPPF && hasCoat) {
    return {
      desc: `PPF + ガラスコーティングの複合施工。要部へ自己修復 PPF を貼り込み、全面に ${layers} 層コーティングを施工。`,
      material: `Ledra PPF Pro + Coat L${layers}`,
      area: "ボディ全面",
      hours: "10.5h",
    };
  }
  if (hasPPF) {
    return {
      desc: "ペイントプロテクションフィルム施工。脱脂・採寸の上、対象パネルへ自己修復 PPF を貼り込み、エッジを巻き込み処理。",
      material: "Ledra PPF Pro",
      area: svc.includes("フル") || svc.includes("ボンネット") ? "ボンネット全面" : "フロント周り",
      hours: "6.0h",
    };
  }
  if (svc.includes("フィルム")) {
    return {
      desc: "ウィンドウフィルム施工。可視光・赤外線カット率を測定の上、各ガラスへ気泡なく貼り込み。",
      material: "Ledra Window Film",
      area: "ガラス全面",
      hours: "3.5h",
    };
  }
  return {
    desc: `ガラスコーティング・ボディ全面。下地処理 (鉄粉除去 → 軽研磨 → 脱脂) を経て、${layers} 層 + 撥水仕上げを施工。`,
    material: `Ledra Coat L${layers}`,
    area: "ボディ全面",
    hours: "7.5h",
  };
}

function CertDetailBody({ row }: { row: (typeof CERT_ROWS)[number] }) {
  const svcInfo = certServiceInfo(row.svc);
  const isFinal = row.st === "issued" || row.st === "archived";
  // Flow: review (検収中) → pending (発行待ち) → issued (公式) → archived (完了).
  // The inspector has signed off everything except a certificate still in review.
  const inspectorSigned = row.st !== "review";
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 28px 24px",
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: 16,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
          }}
        >
          <Eyebrow>施工概要</Eyebrow>
          <div style={{ fontSize: 17, fontWeight: 600, color: c.ink, marginTop: 8 }}>{row.svc}</div>
          <div style={{ fontSize: 12.5, color: c.ink2, lineHeight: 1.65, marginTop: 8 }}>{svcInfo.desc}</div>
          <div style={{ height: 1, background: c.lineHair, margin: "14px 0" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, fontSize: 12 }}>
            {[
              { l: "入庫日", v: row.dt },
              { l: "状態", v: CERT_STATUS[row.st].l },
              { l: "工数", v: svcInfo.hours, mono: true },
              { l: "使用材料", v: svcInfo.material },
              { l: "施工エリア", v: svcInfo.area },
              { l: "担当", v: "山田 大輔" },
            ].map((kv, i) => (
              <div key={i}>
                <div style={{ fontSize: 10.5, color: c.muted, fontWeight: 500 }}>{kv.l}</div>
                <div
                  style={{ fontSize: 13, color: c.ink, marginTop: 4, fontFamily: kv.mono ? t.font.mono : "inherit" }}
                >
                  {kv.v}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Eyebrow>施工写真</Eyebrow>
            <Mono style={{ fontSize: 11, color: c.muted }}>12</Mono>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: c.blueText, cursor: "pointer" }}>全て見る →</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
              marginTop: 12,
              flex: 1,
              minHeight: 120,
            }}
          >
            {["BEFORE", "AFTER", "DETAIL · BONNET", "DETAIL · ROOF"].map((lbl, i) => (
              <div
                key={i}
                style={{
                  background: `linear-gradient(135deg, ${c.inset}, ${c.bg})`,
                  borderRadius: t.radius.md,
                  boxShadow: `inset 0 0 0 1px ${c.line}`,
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 8,
                  overflow: "hidden",
                }}
              >
                <Mono
                  style={{ fontSize: 9.5, color: c.muted, background: c.surface, padding: "1px 5px", borderRadius: 4 }}
                >
                  {lbl}
                </Mono>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "16px 18px",
          }}
        >
          <Eyebrow>顧客</Eyebrow>
          <div style={{ fontSize: 15, fontWeight: 600, color: c.ink, marginTop: 6 }}>{row.cust}</div>
          <div style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>
            {row.cust.includes("会社") ? "法人" : "個人"} · リピート 3 回目
          </div>
          <div style={{ height: 1, background: c.lineHair, margin: "12px 0" }} />
          <Eyebrow>車両</Eyebrow>
          <div style={{ fontSize: 13.5, color: c.ink, marginTop: 6, fontWeight: 500 }}>{row.car}</div>
          <Mono style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>横浜 301 · 登録車両</Mono>
        </div>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eyebrow>検収サイン</Eyebrow>
            <div style={{ flex: 1 }} />
            <StatusBadge kind={isFinal ? "emerald" : row.st === "pending" ? "blue" : "amber"}>
              {isFinal ? "完了" : row.st === "pending" ? "発行待ち" : "残 1"}
            </StatusBadge>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {[
              { l: "施工者", n: "山田 大輔", done: true },
              { l: "検収者", n: "河本 雄一", done: inspectorSigned },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: s.done ? c.emeraldDim : c.inset,
                    color: s.done ? c.emeraldText : c.muted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.done ? (
                    <Ico.check style={{ width: 14, height: 14 }} />
                  ) : (
                    <Ico.user style={{ width: 14, height: 14 }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: c.muted, fontWeight: 600, letterSpacing: "0.06em" }}>{s.l}</div>
                  <div style={{ fontSize: 12.5, color: c.ink, marginTop: 1 }}>{s.n}</div>
                </div>
                {s.done ? (
                  <Mono style={{ fontSize: 10.5, color: c.muted }}>05/18 15:32</Mono>
                ) : (
                  <span style={{ fontSize: 11.5, color: c.blueText, cursor: "pointer", fontWeight: 500 }}>
                    サイン →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: c.goldDim,
            borderRadius: t.radius.lg,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: c.surface,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: c.gold,
            }}
          >
            <Ico.shield style={{ width: 18, height: 18 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: c.goldText, fontWeight: 600 }}>Ledra 公式 証明書</div>
            <div style={{ fontSize: 11, color: c.goldText, opacity: 0.78, marginTop: 2 }}>
              {isFinal
                ? "改ざん不可で確定済みです"
                : row.st === "pending"
                  ? "発行で改ざん不可に確定します"
                  : "検収完了で改ざん不可で確定します"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CASE_ROWS = [
  {
    id: "JOB-2412",
    cust: "田中 雅人",
    car: "ALPHARD",
    svc: "コーティング 5層",
    in: "05/16",
    due: "05/20",
    mech: "山田",
    st: "wip",
    prog: 60,
    sla: "ok",
  },
  {
    id: "JOB-2411",
    cust: "佐々木 健司",
    car: "LEXUS RX 500h",
    svc: "PPF フルボンネット",
    in: "05/15",
    due: "05/19",
    mech: "林",
    st: "wip",
    prog: 80,
    sla: "ok",
  },
  {
    id: "JOB-2410",
    cust: "株式会社 木野",
    car: "HIACE GDH206W",
    svc: "ウィンドウフィルム",
    in: "05/15",
    due: "05/17",
    mech: "山田",
    st: "review",
    prog: 100,
    sla: "tight",
  },
  {
    id: "JOB-2409",
    cust: "横田 美紀",
    car: "CIVIC FL5",
    svc: "ラッピング (マットPPF)",
    in: "05/14",
    due: "05/22",
    mech: "中川",
    st: "wip",
    prog: 35,
    sla: "ok",
  },
  {
    id: "JOB-2408",
    cust: "高橋 隆志",
    car: "PORSCHE 992 GT3",
    svc: "コーティング 7層",
    in: "05/14",
    due: "05/18",
    mech: "林",
    st: "review",
    prog: 100,
    sla: "over",
  },
  {
    id: "JOB-2407",
    cust: "小野 結衣",
    car: "BMW M3 G80",
    svc: "PPF + コーティング",
    in: "05/13",
    due: "05/21",
    mech: "中川",
    st: "wip",
    prog: 50,
    sla: "ok",
  },
  {
    id: "JOB-2406",
    cust: "岸 文哉",
    car: "GR YARIS",
    svc: "ラッピング",
    in: "05/13",
    due: "05/16",
    mech: "山田",
    st: "pending",
    prog: 0,
    sla: "tight",
  },
];
const CASE_STATUS: Record<string, { l: string; tone: string }> = {
  pending: { l: "未着手", tone: "muted" },
  wip: { l: "作業中", tone: "blue" },
  review: { l: "検収待ち", tone: "amber" },
};

function CaseListPage({ go }: { go: Go }) {
  const cols = "110px 1.2fr 1.4fr 80px 80px 80px 110px 1.3fr 24px";
  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", background: c.bg, minWidth: 0, overflow: "hidden" }}
    >
      <div style={{ flex: 1, padding: "20px 28px 24px", minHeight: 0, overflow: "auto" }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            overflow: "hidden",
          }}
          className="lp-table"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              padding: "10px 18px",
              borderBottom: `1px solid ${c.line}`,
              fontSize: 10.5,
              fontWeight: 600,
              color: c.muted,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            <div>案件 ID</div>
            <div>顧客</div>
            <div>車両</div>
            <div>入庫</div>
            <div>納期</div>
            <div>担当</div>
            <div>状態</div>
            <div>進捗</div>
            <div />
          </div>
          {CASE_ROWS.map((r, i) => {
            const stt = CASE_STATUS[r.st];
            const slaColor = r.sla === "over" ? c.red : r.sla === "tight" ? c.amberText : c.muted;
            return (
              <div
                key={i}
                onClick={() => go("job:" + r.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  padding: "12px 18px",
                  alignItems: "center",
                  borderBottom: i < CASE_ROWS.length - 1 ? `1px solid ${c.lineHair}` : "none",
                  fontSize: 12.5,
                  color: c.ink,
                  cursor: "pointer",
                }}
              >
                <Mono style={{ fontSize: 12 }}>{r.id}</Mono>
                <div>{r.cust}</div>
                <div style={{ color: c.ink2 }}>{r.car}</div>
                <Mono style={{ fontSize: 11.5, color: c.muted }}>{r.in}</Mono>
                <Mono style={{ fontSize: 11.5, color: slaColor }}>{r.due}</Mono>
                <div style={{ color: c.ink2 }}>{r.mech}</div>
                <div>
                  <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: c.inset, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${r.prog}%`, height: "100%", background: r.prog === 100 ? c.gold : c.ink }} />
                  </div>
                  <Mono style={{ fontSize: 10.5, color: c.muted, minWidth: 28, textAlign: "right" }}>{r.prog}%</Mono>
                </div>
                <div style={{ color: c.muted, display: "inline-flex", justifyContent: "flex-end" }}>
                  <Ico.dots style={{ width: 16, height: 16 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const MECH_FULL: Record<string, string> = {
  山田: "山田 大輔",
  林: "林 翔平",
  中川: "中川 結菜",
  田島: "田島 美和子",
};

// Derive the quote line items from the selected job's service so the estimate
// does not show the same coating+PPF package for every record.
function caseEstimate(svc: string): { items: { l: string; v: string }[]; total: string } {
  const base = { l: "下地処理", v: "¥38,000" };
  if (svc.includes("ラッピング")) {
    return { items: [{ l: "カーラッピング", v: "¥280,000" }, base], total: "¥349,800" };
  }
  if (svc.includes("PPF") && svc.includes("コーティング")) {
    return {
      items: [{ l: "PPF (要部)", v: "¥120,000" }, { l: "ガラスコーティング", v: "¥180,000" }, base],
      total: "¥371,800",
    };
  }
  if (svc.includes("PPF")) {
    return { items: [{ l: svc, v: "¥150,000" }, base], total: "¥206,800" };
  }
  if (svc.includes("フィルム")) {
    return { items: [{ l: "ウィンドウフィルム", v: "¥68,000" }], total: "¥74,800" };
  }
  const layers = svc.match(/(\d+)\s*層/)?.[1] ?? "5";
  const coatPrice = layers === "7" ? "¥320,000" : "¥220,000";
  const total = layers === "7" ? "¥413,600" : "¥303,600";
  return {
    items: [{ l: `コーティング ${layers}層`, v: coatPrice }, base, { l: "室内クリーニング", v: "¥18,000" }],
    total,
  };
}

function CaseDetailBody({ row }: { row: (typeof CASE_ROWS)[number] }) {
  const mechFull = MECH_FULL[row.mech] ?? row.mech;
  const est = caseEstimate(row.svc);
  // Derive the workflow step state from the row's progress so review-ready
  // jobs (prog 100) don't show a half-finished stepper, and the final step's
  // delivery date matches the header's納期.
  const workLabel = row.svc.includes("ラッピング")
    ? "ラッピング施工"
    : row.svc.includes("フィルム")
      ? "フィルム施工"
      : row.svc.includes("PPF") && row.svc.includes("コーティング")
        ? "PPF + コーティング施工"
        : row.svc.includes("PPF")
          ? "PPF 施工"
          : "コーティング施工";
  const STEP_LABELS = ["入庫 / 受付", "下地処理", workLabel, "品質チェック", "検収サイン", "納車 / 証明書発行"];
  // floor (not round) so completed steps never get ahead of the row's progress.
  // A job awaiting inspection (review) keeps the 検収サイン / 納車 steps open even
  // at 100% so the stepper doesn't look already approved and issued.
  const SIGNOFF_STEP = 4; // 検収サイン
  let doneCount = Math.floor((row.prog / 100) * STEP_LABELS.length);
  if (row.st === "review") doneCount = Math.min(doneCount, SIGNOFF_STEP);
  const steps = STEP_LABELS.map((l, i) => {
    const done = i < doneCount;
    const by = i === 0 || i === STEP_LABELS.length - 1 ? "田島" : i === SIGNOFF_STEP ? "河本" : row.mech;
    let time: string;
    if (done) time = "完了";
    else if (i === doneCount && row.prog > 0) time = "進行中";
    else if (i === STEP_LABELS.length - 1) time = `予定 ${row.due}`;
    else time = "未着手";
    return { l, done, by, time };
  });
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 28px 24px",
        display: "grid",
        gridTemplateColumns: "1.7fr 1fr",
        gap: 16,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <Eyebrow>進捗</Eyebrow>
            <Mono style={{ fontSize: 12, color: c.muted }}>
              {row.st === "review" ? "検収待ち" : `${row.prog}%`} · 工程 {doneCount}/{STEP_LABELS.length}
            </Mono>
            <div style={{ flex: 1 }} />
            <Mono style={{ fontSize: 11.5, color: c.muted }}>納期 {row.due}</Mono>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
            {steps.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: i < steps.length - 1 ? `1px solid ${c.lineHair}` : "none",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: s.done ? c.emeraldDim : c.inset,
                    color: s.done ? c.emeraldText : c.muted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {s.done ? (
                    <Ico.check style={{ width: 12, height: 12 }} />
                  ) : (
                    <Mono style={{ fontSize: 10, fontWeight: 600 }}>{i + 1}</Mono>
                  )}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: s.done ? c.ink2 : c.ink, fontWeight: s.done ? 400 : 500 }}>
                  {s.l}
                </div>
                <Mono style={{ fontSize: 10.5, color: c.muted }}>{s.by}</Mono>
                <Mono style={{ fontSize: 10.5, color: c.muted, minWidth: 90, textAlign: "right" }}>{s.time}</Mono>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
            flex: 1,
            minHeight: 0,
          }}
        >
          <Eyebrow>見積</Eyebrow>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 8, marginTop: 12, fontSize: 12.5 }}
          >
            {est.items.map((it, i) => (
              <Fragment key={i}>
                <div style={{ color: c.ink }}>{it.l}</div>
                <Mono style={{ color: c.muted, textAlign: "right" }}>×1</Mono>
                <Mono style={{ color: c.ink, textAlign: "right" }}>{it.v}</Mono>
              </Fragment>
            ))}
          </div>
          <div style={{ height: 1, background: c.lineHair, margin: "12px 0" }} />
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 11.5, color: c.muted }}>合計 (税込)</div>
            <div style={{ flex: 1 }} />
            <Mono style={{ fontSize: 18, color: c.ink, fontWeight: 500, letterSpacing: "-0.01em" }}>{est.total}</Mono>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "16px 18px",
          }}
        >
          <Eyebrow>顧客</Eyebrow>
          <div style={{ fontSize: 15, fontWeight: 600, color: c.ink, marginTop: 6 }}>{row.cust}</div>
          <Mono style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>080-XXXX-1234 · リピート 3 回目</Mono>
          <div style={{ height: 1, background: c.lineHair, margin: "12px 0" }} />
          <Eyebrow>車両</Eyebrow>
          <div style={{ fontSize: 13.5, color: c.ink, marginTop: 6, fontWeight: 500 }}>{row.car}</div>
          <Mono style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>横浜 301 · 登録車両</Mono>
        </div>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "16px 18px",
          }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>担当 / 関係者</Eyebrow>
          {[
            { l: "担当メカ", n: mechFull, sub: "" },
            { l: "受付", n: "田島 美和子", sub: "" },
            { l: "検収", n: "河本 雄一", sub: "オーナー" },
          ].map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom: i < 2 ? `1px solid ${c.lineHair}` : "none",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c.inset,
                  color: c.ink2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {m.n.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: c.muted, fontWeight: 600, letterSpacing: "0.06em" }}>{m.l}</div>
                <div style={{ fontSize: 12.5, color: c.ink, marginTop: 1 }}>{m.n}</div>
              </div>
              {m.sub && <Mono style={{ fontSize: 10.5, color: c.muted }}>{m.sub}</Mono>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const INSURANCE_CASES = [
  {
    id: "INS-558",
    prov: "AIOI",
    pol: "AIO-2024-99812",
    cust: "佐々木 健司",
    st: "waiting",
    amt: "¥412,000",
    d: "05/17",
  },
  { id: "INS-557", prov: "TMNF", pol: "TM-A-77231", cust: "横田 美紀", st: "approved", amt: "¥185,000", d: "05/16" },
  {
    id: "INS-556",
    prov: "SOMPO",
    pol: "SP-X-441922",
    cust: "株式会社 木野",
    st: "rejected",
    amt: "¥92,000",
    d: "05/15",
  },
  {
    id: "INS-555",
    prov: "AIOI",
    pol: "AIO-2024-99811",
    cust: "田中 雅人",
    st: "approved",
    amt: "¥240,000",
    d: "05/15",
  },
  { id: "INS-554", prov: "MS&AD", pol: "MS-B-3318", cust: "岸 文哉", st: "waiting", amt: "¥158,000", d: "05/14" },
];
const INS_STATUS: Record<string, { l: string; tone: string }> = {
  waiting: { l: "審査待ち", tone: "amber" },
  approved: { l: "承認", tone: "emerald" },
  rejected: { l: "差戻し", tone: "muted" },
};

function InsuranceBody() {
  const cols = "100px 100px 1.5fr 1.2fr 110px 110px 90px 24px";
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: c.line,
          borderRadius: t.radius.lg,
          overflow: "hidden",
          boxShadow: `inset 0 0 0 1px ${c.line}`,
        }}
      >
        {[
          { p: "AIOI 損保", conn: true, cases: 18, last: "5分前" },
          { p: "東京海上", conn: true, cases: 12, last: "12分前" },
          { p: "損保ジャパン", conn: true, cases: 9, last: "1時間前" },
          { p: "MS&AD", conn: false, cases: 4, last: "同期エラー" },
        ].map((p, i) => (
          <div key={i} style={{ background: c.surface, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.conn ? c.emeraldText : c.red }} />
              <div style={{ fontSize: 11.5, color: c.muted, fontWeight: 500 }}>{p.p}</div>
            </div>
            <Mono
              style={{
                fontSize: 22,
                color: c.ink,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                marginTop: 6,
                display: "block",
              }}
            >
              {p.cases}
            </Mono>
            <div style={{ fontSize: 10.5, color: p.conn ? c.muted : c.red, marginTop: 2 }}>{p.last}</div>
          </div>
        ))}
      </div>
      <div
        className="lp-table"
        style={{
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            padding: "10px 18px",
            borderBottom: `1px solid ${c.line}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: c.muted,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <div>案件 ID</div>
          <div>保険会社</div>
          <div>証券番号</div>
          <div>顧客</div>
          <div>状態</div>
          <div style={{ textAlign: "right" }}>請求額</div>
          <div style={{ textAlign: "right" }}>提出日</div>
          <div />
        </div>
        {INSURANCE_CASES.map((r, i) => {
          const stt = INS_STATUS[r.st];
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                padding: "12px 18px",
                alignItems: "center",
                borderBottom: i < INSURANCE_CASES.length - 1 ? `1px solid ${c.lineHair}` : "none",
                fontSize: 12.5,
              }}
            >
              <Mono style={{ fontSize: 12 }}>{r.id}</Mono>
              <div style={{ color: c.ink2, fontWeight: 500 }}>{r.prov}</div>
              <Mono style={{ fontSize: 11.5, color: c.muted }}>{r.pol}</Mono>
              <div style={{ color: c.ink }}>{r.cust}</div>
              <div>
                <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>
              </div>
              <Mono style={{ color: c.ink, textAlign: "right" }}>{r.amt}</Mono>
              <Mono style={{ fontSize: 11.5, color: c.muted, textAlign: "right" }}>{r.d}</Mono>
              <div style={{ color: c.muted, display: "inline-flex", justifyContent: "flex-end" }}>
                <Ico.dots style={{ width: 16, height: 16 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MEMBERS = [
  { n: "河本 雄一", mail: "kawamoto@yokohama-garage.jp", role: "オーナー", active: "今" },
  { n: "田島 美和子", mail: "tajima@yokohama-garage.jp", role: "受付", active: "12分前" },
  { n: "山田 大輔", mail: "yamada@yokohama-garage.jp", role: "リードメカ", active: "1時間前" },
  { n: "林 翔平", mail: "hayashi@yokohama-garage.jp", role: "メカ", active: "3時間前" },
  { n: "中川 結菜", mail: "nakagawa@yokohama-garage.jp", role: "メカ", active: "昨日" },
];
const SETTINGS_NAV: { g?: string; l?: string; active?: boolean; badge?: number }[] = [
  { g: "組織" },
  { l: "店舗情報" },
  { l: "メンバー", active: true, badge: 5 },
  { l: "権限ロール" },
  { g: "請求 / 連携" },
  { l: "料金プラン" },
  { l: "請求書 / 支払い" },
  { l: "損保連携設定" },
  { g: "システム" },
  { l: "通知設定" },
  { l: "API / Webhook" },
  { l: "監査ログ" },
];

function SettingsBody() {
  const cols = "1.5fr 2fr 1fr 100px 24px";
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 28px 24px",
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: 24,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1, alignSelf: "start" }}>
        {SETTINGS_NAV.map((it, i) =>
          it.g ? (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: c.muted,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px 12px 6px",
              }}
            >
              {it.g}
            </div>
          ) : (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: t.radius.sm,
                background: it.active ? c.inset : "transparent",
                color: it.active ? c.ink : c.ink2,
                fontSize: 12.5,
                fontWeight: it.active ? 500 : 400,
                cursor: "pointer",
              }}
            >
              {it.l}
              {it.badge != null && (
                <Mono style={{ marginLeft: "auto", fontSize: 10.5, color: c.muted, fontWeight: 500 }}>{it.badge}</Mono>
              )}
            </div>
          ),
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <div>
          <H2>メンバー</H2>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4, lineHeight: 1.55 }}>
            横浜ガレージ工房 の従業員アカウントを管理。証明書の検収者はオーナー権限を持つメンバーに限られます。
          </div>
        </div>
        <div
          className="lp-table"
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              padding: "10px 18px",
              borderBottom: `1px solid ${c.line}`,
              fontSize: 10.5,
              fontWeight: 600,
              color: c.muted,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            <div>名前</div>
            <div>メール</div>
            <div>ロール</div>
            <div style={{ textAlign: "right" }}>最終ログイン</div>
            <div />
          </div>
          {MEMBERS.map((m, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                padding: "12px 18px",
                alignItems: "center",
                borderBottom: i < MEMBERS.length - 1 ? `1px solid ${c.lineHair}` : "none",
                fontSize: 12.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c.inset,
                    color: c.ink2,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {m.n.charAt(0)}
                </div>
                <div style={{ color: c.ink }}>{m.n}</div>
              </div>
              <Mono style={{ fontSize: 11.5, color: c.muted }}>{m.mail}</Mono>
              <div style={{ color: c.ink2 }}>{m.role}</div>
              <Mono style={{ fontSize: 11, color: c.muted, textAlign: "right" }}>{m.active}</Mono>
              <div style={{ color: c.muted, display: "inline-flex", justifyContent: "flex-end" }}>
                <Ico.dots style={{ width: 16, height: 16 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared list-page wrappers ───────────────────────────────
function BodyScroll({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
        overflow: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// KPI strip matching the dashboard / insurance convention.
function KpiStrip({ items }: { items: { l: string; v: string; gold?: boolean; sub?: string }[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 1,
        background: c.line,
        borderRadius: t.radius.lg,
        overflow: "hidden",
        boxShadow: `inset 0 0 0 1px ${c.line}`,
      }}
    >
      {items.map((k, i) => (
        <div key={i} style={{ background: c.surface, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: k.gold ? c.goldText : c.muted, letterSpacing: "0.06em", fontWeight: 600 }}>
            {k.l}
          </div>
          <Mono
            style={{
              fontSize: 22,
              color: c.ink,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              marginTop: 6,
              display: "block",
            }}
          >
            {k.v}
          </Mono>
          {k.sub && <div style={{ fontSize: 10.5, color: c.muted, marginTop: 2 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Analytics ───────────────────────────────────────────────
const CERT_TREND = [
  { m: "12月", v: 24 },
  { m: "1月", v: 28 },
  { m: "2月", v: 31 },
  { m: "3月", v: 27 },
  { m: "4月", v: 34 },
  { m: "5月", v: 38 },
];
const SVC_BREAKDOWN = [
  { l: "コーティング", pct: 38 },
  { l: "PPF", pct: 27 },
  { l: "フィルム", pct: 18 },
  { l: "ラッピング", pct: 17 },
];

function AnalyticsBody() {
  const maxTrend = Math.max(...CERT_TREND.map((d) => d.v));
  return (
    <BodyScroll>
      <KpiStrip
        items={[
          { l: "売上 · 今月", v: "¥3.82M" },
          { l: "案件", v: "42" },
          { l: "証明書発行", v: "38", gold: true },
          { l: "平均単価", v: "¥91K" },
        ]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Eyebrow>発行推移</Eyebrow>
            <div style={{ flex: 1 }} />
            <Mono style={{ fontSize: 11, color: c.muted }}>直近 6ヶ月</Mono>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 160,
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: `repeat(${CERT_TREND.length}, 1fr)`,
              alignItems: "end",
              gap: 14,
            }}
          >
            {CERT_TREND.map((d, i) => {
              const last = i === CERT_TREND.length - 1;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <Mono style={{ fontSize: 10.5, color: last ? c.ink : c.muted, fontWeight: last ? 600 : 400 }}>
                    {d.v}
                  </Mono>
                  <div
                    style={{
                      width: "100%",
                      height: `${(d.v / maxTrend) * 130}px`,
                      background: last ? c.gold : c.ink,
                      borderRadius: `${t.radius.sm} ${t.radius.sm} 0 0`,
                      opacity: last ? 1 : 0.8,
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: c.muted }}>{d.m}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          style={{
            background: c.surface,
            borderRadius: t.radius.lg,
            boxShadow: `inset 0 0 0 1px ${c.line}`,
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Eyebrow>施工種別</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
            {SVC_BREAKDOWN.map((s, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 12.5, color: c.ink, fontWeight: 500 }}>{s.l}</div>
                  <div style={{ flex: 1 }} />
                  <Mono style={{ fontSize: 12, color: c.ink2 }}>{s.pct}%</Mono>
                </div>
                <div
                  style={{
                    height: 6,
                    background: c.inset,
                    borderRadius: 3,
                    overflow: "hidden",
                    marginTop: 7,
                  }}
                >
                  <div style={{ width: `${s.pct}%`, height: "100%", background: c.blue, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BodyScroll>
  );
}

// ── Customers (derived from CERT_ROWS) ──────────────────────
function CustomersBody() {
  const byCust = new Map<string, { cust: string; cars: Set<string>; certs: number; lastDt: string }>();
  for (const r of CERT_ROWS) {
    const e = byCust.get(r.cust) ?? { cust: r.cust, cars: new Set<string>(), certs: 0, lastDt: r.dt };
    e.cars.add(r.car);
    e.certs += 1;
    if (r.dt > e.lastDt) e.lastDt = r.dt;
    byCust.set(r.cust, e);
  }
  const rows = Array.from(byCust.values())
    .map((e) => ({
      cust: e.cust,
      corp: e.cust.includes("会社"),
      cars: e.cars.size,
      certs: e.certs,
      lastDt: e.lastDt,
    }))
    .sort((a, b) => (a.lastDt < b.lastDt ? 1 : -1));
  const corpCount = rows.filter((r) => r.corp).length;
  const cols = "1.6fr 110px 90px 110px 120px";
  return (
    <BodyScroll>
      <KpiStrip
        items={[
          { l: "総顧客数", v: String(rows.length) },
          { l: "法人", v: String(corpCount) },
          { l: "個人", v: String(rows.length - corpCount) },
          { l: "今月の新規", v: "3" },
        ]}
      />
      <div
        className="lp-table"
        style={{
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            padding: "10px 18px",
            borderBottom: `1px solid ${c.line}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: c.muted,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <div>顧客</div>
          <div>種別</div>
          <div style={{ textAlign: "right" }}>車両</div>
          <div style={{ textAlign: "right" }}>証明書</div>
          <div style={{ textAlign: "right" }}>最終来店</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              padding: "12px 18px",
              alignItems: "center",
              borderBottom: i < rows.length - 1 ? `1px solid ${c.lineHair}` : "none",
              fontSize: 12.5,
              color: c.ink,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c.inset,
                  color: c.ink2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {r.cust.charAt(0)}
              </div>
              <div>{r.cust}</div>
            </div>
            <div>
              <StatusBadge kind={r.corp ? "blue" : "muted"}>{r.corp ? "法人" : "個人"}</StatusBadge>
            </div>
            <Mono style={{ fontSize: 12, color: c.ink2, textAlign: "right" }}>{r.cars}</Mono>
            <Mono style={{ fontSize: 12, color: c.ink2, textAlign: "right" }}>{r.certs}</Mono>
            <Mono style={{ fontSize: 11.5, color: c.muted, textAlign: "right" }}>{r.lastDt}</Mono>
          </div>
        ))}
      </div>
    </BodyScroll>
  );
}

// ── Invoices ────────────────────────────────────────────────
const INVOICE_ROWS = [
  { id: "INV-2024-018", cust: "田中 雅人", iss: "2024/05/18", due: "2024/06/17", amt: "¥303,600", st: "draft" },
  { id: "INV-2024-017", cust: "佐々木 健司", iss: "2024/05/17", due: "2024/06/16", amt: "¥206,800", st: "sent" },
  { id: "INV-2024-016", cust: "株式会社 木野", iss: "2024/05/15", due: "2024/06/14", amt: "¥74,800", st: "paid" },
  { id: "INV-2024-015", cust: "横田 美紀", iss: "2024/05/14", due: "2024/06/13", amt: "¥349,800", st: "sent" },
  { id: "INV-2024-014", cust: "高橋 隆志", iss: "2024/04/28", due: "2024/05/28", amt: "¥413,600", st: "overdue" },
  { id: "INV-2024-013", cust: "小野 結衣", iss: "2024/04/22", due: "2024/05/22", amt: "¥371,800", st: "paid" },
];
const INVOICE_STATUS: Record<string, { l: string; tone: string }> = {
  draft: { l: "下書き", tone: "muted" },
  sent: { l: "送付済", tone: "blue" },
  paid: { l: "入金済", tone: "emerald" },
  overdue: { l: "期限超過", tone: "red" },
};

function InvoicesBody() {
  const cols = "150px 1.4fr 110px 110px 120px 100px";
  return (
    <BodyScroll>
      <KpiStrip
        items={[
          { l: "請求総額", v: "¥1.72M" },
          { l: "入金済", v: "¥446K", sub: "2 件" },
          { l: "未入金", v: "¥860K", sub: "3 件" },
          { l: "期限超過", v: "¥413K", sub: "1 件" },
        ]}
      />
      <div
        className="lp-table"
        style={{
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            padding: "10px 18px",
            borderBottom: `1px solid ${c.line}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: c.muted,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <div>請求番号</div>
          <div>顧客</div>
          <div>発行日</div>
          <div>期限</div>
          <div style={{ textAlign: "right" }}>金額</div>
          <div>状態</div>
        </div>
        {INVOICE_ROWS.map((r, i) => {
          const stt = INVOICE_STATUS[r.st];
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                padding: "12px 18px",
                alignItems: "center",
                borderBottom: i < INVOICE_ROWS.length - 1 ? `1px solid ${c.lineHair}` : "none",
                fontSize: 12.5,
                color: c.ink,
              }}
            >
              <Mono style={{ fontSize: 12 }}>{r.id}</Mono>
              <div>{r.cust}</div>
              <Mono style={{ fontSize: 11.5, color: c.muted }}>{r.iss}</Mono>
              <Mono style={{ fontSize: 11.5, color: r.st === "overdue" ? c.red : c.muted }}>{r.due}</Mono>
              <Mono style={{ color: c.ink, textAlign: "right" }}>{r.amt}</Mono>
              <div>
                <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>
              </div>
            </div>
          );
        })}
      </div>
    </BodyScroll>
  );
}

// ── Inventory ───────────────────────────────────────────────
const INVENTORY_ROWS = [
  { id: "PRT-C5L", name: "Ledra Coat L5 (1L)", stock: 14, reorder: 6 },
  { id: "PRT-C7L", name: "Ledra Coat L7 (1L)", stock: 5, reorder: 6 },
  { id: "PRT-PPF", name: "PPF Pro ロール (1.52m)", stock: 8, reorder: 4 },
  { id: "PRT-WF", name: "ウィンドウフィルム ロール", stock: 3, reorder: 5 },
  { id: "PRT-WRP", name: "ラップフィルム ロール", stock: 6, reorder: 3 },
  { id: "PRT-DEG", name: "脱脂剤 (5L)", stock: 11, reorder: 8 },
  { id: "PRT-PAD", name: "研磨パッド (50枚)", stock: 2, reorder: 4 },
];

function InventoryBody() {
  const rows = INVENTORY_ROWS.map((r) => {
    let st: { l: string; tone: string };
    if (r.stock <= r.reorder) st = { l: "要発注", tone: "red" };
    else if (r.stock <= r.reorder * 1.5) st = { l: "残少", tone: "amber" };
    else st = { l: "在庫あり", tone: "emerald" };
    return { ...r, st };
  });
  const reorderCount = rows.filter((r) => r.st.l === "要発注").length;
  const cols = "120px 1.6fr 90px 90px 110px";
  return (
    <BodyScroll>
      <KpiStrip
        items={[
          { l: "総SKU", v: String(rows.length) },
          { l: "要発注", v: String(reorderCount) },
          { l: "今月入荷", v: "6" },
          { l: "在庫評価額", v: "¥1.24M" },
        ]}
      />
      <div
        className="lp-table"
        style={{
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            padding: "10px 18px",
            borderBottom: `1px solid ${c.line}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: c.muted,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <div>品番</div>
          <div>品名</div>
          <div style={{ textAlign: "right" }}>在庫数</div>
          <div style={{ textAlign: "right" }}>発注点</div>
          <div>状態</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              padding: "12px 18px",
              alignItems: "center",
              borderBottom: i < rows.length - 1 ? `1px solid ${c.lineHair}` : "none",
              fontSize: 12.5,
              color: c.ink,
            }}
          >
            <Mono style={{ fontSize: 12 }}>{r.id}</Mono>
            <div style={{ color: c.ink }}>{r.name}</div>
            <Mono style={{ fontSize: 12, color: c.ink, textAlign: "right" }}>{r.stock}</Mono>
            <Mono style={{ fontSize: 12, color: c.muted, textAlign: "right" }}>{r.reorder}</Mono>
            <div>
              <StatusBadge kind={r.st.tone}>{r.st.l}</StatusBadge>
            </div>
          </div>
        ))}
      </div>
    </BodyScroll>
  );
}

// ── Customer portal ─────────────────────────────────────────
const PORTAL_ACTIVITY = [
  { cust: "田中 雅人", act: "証明書を閲覧", ts: "5分前" },
  { cust: "横田 美紀", act: "レビューを投稿 ★5", ts: "1時間前" },
  { cust: "高橋 隆志", act: "QRから来店予約", ts: "3時間前" },
  { cust: "佐々木 健司", act: "PDF をダウンロード", ts: "昨日 18:20" },
  { cust: "小野 結衣", act: "証明書を共有", ts: "昨日 14:05" },
];

function PortalBody() {
  return (
    <BodyScroll>
      <KpiStrip
        items={[
          { l: "登録顧客", v: "312" },
          { l: "アクティブ率", v: "68%" },
          { l: "平均評価", v: "★4.8" },
          { l: "今月レビュー", v: "27" },
        ]}
      />
      <div
        style={{
          background: c.surface,
          borderRadius: t.radius.lg,
          boxShadow: `inset 0 0 0 1px ${c.line}`,
          padding: "18px 20px",
        }}
      >
        <Eyebrow>最近のポータル活動</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
          {PORTAL_ACTIVITY.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < PORTAL_ACTIVITY.length - 1 ? `1px solid ${c.lineHair}` : "none",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c.inset,
                  color: c.ink2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {a.cust.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: c.ink, fontWeight: 500 }}>{a.cust}</div>
                <div style={{ fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{a.act}</div>
              </div>
              <Mono style={{ fontSize: 10.5, color: c.muted }}>{a.ts}</Mono>
            </div>
          ))}
        </div>
      </div>
    </BodyScroll>
  );
}

// ════════════════════════════════════════════════════════════
// App — hash router. Each route configures the L3 page bar.
// ════════════════════════════════════════════════════════════
function parseHash(): string {
  if (typeof window === "undefined") return "dashboard";
  return (window.location.hash || "#dashboard").slice(1) || "dashboard";
}

export default function LedraPrototype() {
  const [route, setRoute] = useState("dashboard");
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // The prototype is built with inline styles only, so the global
  // `[data-theme="dark"] span { color:#fff !important }` safety-net in
  // globals.css would clobber token-colored text. Force the document into
  // light while this route is mounted. A one-time write is not enough: the
  // root ThemeProvider re-applies `data-theme` on mount, after loading the
  // saved theme, and on OS theme changes — so we observe and re-correct any
  // write back to dark, then restore the previous value on unmount.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    const force = () => {
      if (el.getAttribute("data-theme") !== "light") el.setAttribute("data-theme", "light");
    };
    force();
    const obs = new MutationObserver(force);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
      // Restore the theme ThemeProvider last resolved (it keeps the `__theme`
      // cookie current, including OS changes that happened on this page),
      // falling back to the value captured on mount.
      const cookieTheme = document.cookie.match(/(?:^|;\s*)__theme=(light|dark)/)?.[1];
      const restore = cookieTheme ?? prev;
      if (restore) el.setAttribute("data-theme", restore);
      else el.removeAttribute("data-theme");
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync route to window.location.hash after mount (SSR-safe)
    setRoute(parseHash());
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go: Go = (r) => {
    window.location.hash = r;
  };

  const [base, arg] = route.split(":");
  const active = ACTIVE_MAP[base] || base;

  // Per-route L3 chrome + body.
  let shellProps: {
    crumb: string[];
    crumbRoutes?: string[];
    pageTitle: string;
    pageMeta?: ReactNode;
    tabs?: Tab[];
    pageActions?: ReactNode;
    body: ReactNode;
  };

  switch (base) {
    case "certs":
      shellProps = {
        crumb: ["証明書"],
        pageTitle: "証明書",
        pageMeta: <Mono style={{ fontSize: 12.5, color: c.muted }}>142</Mono>,
        tabs: [
          { l: "全て", active: true, badge: 142 },
          { l: "発行待ち", badge: 3 },
          { l: "検収中" },
          { l: "公式" },
          { l: "完了" },
        ],
        pageActions: (
          <Fragment>
            <SecondaryBtn icon={<Ico.filter style={{ width: 14, height: 14 }} />}>絞り込み</SecondaryBtn>
            <SecondaryBtn icon={<Ico.download style={{ width: 14, height: 14 }} />}>エクスポート</SecondaryBtn>
            <Btn kind="primary" size="sm" icon={<Ico.plus style={{ width: 14, height: 14 }} />}>
              新規証明書
            </Btn>
          </Fragment>
        ),
        body: <CertListPage go={go} />,
      };
      break;
    case "cert": {
      const row = CERT_ROWS.find((r) => r.id === arg) ?? CERT_ROWS[0];
      const stt = CERT_STATUS[row.st];
      const isFinal = row.st === "issued" || row.st === "archived";
      shellProps = {
        crumbRoutes: ["certs"],
        crumb: ["証明書", row.id],
        pageTitle: row.id,
        pageMeta: <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>,
        tabs: [
          { l: "概要", active: true },
          { l: "写真", badge: 12 },
          { l: "工程" },
          { l: "担当 / 検収者" },
          { l: "履歴" },
        ],
        pageActions: (
          <Fragment>
            <SecondaryBtn icon={<Ico.download style={{ width: 14, height: 14 }} />}>PDF</SecondaryBtn>
            <SecondaryBtn icon={<Ico.qr style={{ width: 14, height: 14 }} />}>顧客QR</SecondaryBtn>
            {isFinal ? (
              <Btn kind="secondary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                発行済
              </Btn>
            ) : row.st === "pending" ? (
              <Btn kind="primary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                発行する
              </Btn>
            ) : (
              <Btn kind="primary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                検収して発行
              </Btn>
            )}
          </Fragment>
        ),
        body: <CertDetailBody row={row} />,
      };
      break;
    }
    case "cases":
      shellProps = {
        crumb: ["案件"],
        pageTitle: "案件",
        pageMeta: <Mono style={{ fontSize: 12.5, color: c.muted }}>42</Mono>,
        tabs: [
          { l: "全て", active: true, badge: 42 },
          { l: "未着手", badge: 6 },
          { l: "作業中", badge: 28 },
          { l: "検収待ち", badge: 8 },
        ],
        pageActions: (
          <Fragment>
            <SecondaryBtn icon={<Ico.user style={{ width: 14, height: 14 }} />}>担当: 全員</SecondaryBtn>
            <SecondaryBtn icon={<Ico.download style={{ width: 14, height: 14 }} />}>エクスポート</SecondaryBtn>
            <Btn kind="primary" size="sm" icon={<Ico.plus style={{ width: 14, height: 14 }} />}>
              新規入庫
            </Btn>
          </Fragment>
        ),
        body: <CaseListPage go={go} />,
      };
      break;
    case "job": {
      const row = CASE_ROWS.find((r) => r.id === arg) ?? CASE_ROWS[0];
      const stt = CASE_STATUS[row.st];
      shellProps = {
        crumbRoutes: ["cases"],
        crumb: ["案件", row.id],
        pageTitle: row.id,
        pageMeta: (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <StatusBadge kind={stt.tone}>{stt.l}</StatusBadge>
            <Mono style={{ fontSize: 12, color: c.muted }}>
              {row.cust} · {row.car}
            </Mono>
          </div>
        ),
        tabs: [
          { l: "概要", active: true },
          { l: "工程", badge: 6 },
          { l: "見積 / 請求" },
          { l: "写真", badge: 9 },
          { l: "メモ" },
        ],
        pageActions: (
          <Fragment>
            <SecondaryBtn icon={<Ico.user style={{ width: 14, height: 14 }} />}>担当変更</SecondaryBtn>
            {row.st === "review" ? (
              <Btn kind="primary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                検収を承認
              </Btn>
            ) : row.st === "pending" ? (
              <Btn kind="primary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                作業を開始
              </Btn>
            ) : (
              <Btn kind="primary" size="sm" icon={<Ico.check style={{ width: 14, height: 14 }} />}>
                検収へ送る
              </Btn>
            )}
          </Fragment>
        ),
        body: <CaseDetailBody row={row} />,
      };
      break;
    }
    case "insurance":
      shellProps = {
        crumb: ["外部", "損保案件"],
        pageTitle: "損保連携",
        pageMeta: <Mono style={{ fontSize: 12.5, color: c.muted }}>43 件</Mono>,
        tabs: [
          { l: "全て", active: true, badge: 43 },
          { l: "AIOI 損保", badge: 18 },
          { l: "東京海上" },
          { l: "損保ジャパン" },
          { l: "MS&AD" },
        ],
        pageActions: (
          <Fragment>
            <SecondaryBtn icon={<Ico.download style={{ width: 14, height: 14 }} />}>請求書出力</SecondaryBtn>
            <Btn kind="primary" size="sm" icon={<Ico.plus style={{ width: 14, height: 14 }} />}>
              新規請求
            </Btn>
          </Fragment>
        ),
        body: <InsuranceBody />,
      };
      break;
    case "settings":
      shellProps = {
        crumb: ["設定"],
        pageTitle: "設定",
        pageMeta: <Mono style={{ fontSize: 12, color: c.muted }}>横浜ガレージ工房</Mono>,
        tabs: [{ l: "組織", active: true }, { l: "請求 / 連携" }, { l: "システム" }],
        pageActions: (
          <SecondaryBtn icon={<Ico.download style={{ width: 14, height: 14 }} />}>設定エクスポート</SecondaryBtn>
        ),
        body: <SettingsBody />,
      };
      break;
    case "analytics":
      shellProps = {
        crumb: ["分析"],
        pageTitle: "分析",
        tabs: [{ l: "概要", active: true }, { l: "売上" }, { l: "稼働" }],
        body: <AnalyticsBody />,
      };
      break;
    case "customers":
      shellProps = {
        crumb: ["車両 / 顧客"],
        pageTitle: "車両 / 顧客",
        tabs: [{ l: "全て", active: true }, { l: "個人" }, { l: "法人" }, { l: "VIP" }],
        body: <CustomersBody />,
      };
      break;
    case "invoices":
      shellProps = {
        crumb: ["請求書"],
        pageTitle: "請求書",
        tabs: [{ l: "全て", active: true }, { l: "下書き" }, { l: "送付済" }, { l: "入金済" }],
        body: <InvoicesBody />,
      };
      break;
    case "inventory":
      shellProps = {
        crumb: ["部品 / 在庫"],
        pageTitle: "部品 / 在庫",
        tabs: [{ l: "在庫", active: true }, { l: "発注" }, { l: "低在庫" }],
        body: <InventoryBody />,
      };
      break;
    case "portal":
      shellProps = {
        crumb: ["顧客ポータル"],
        pageTitle: "顧客ポータル",
        tabs: [{ l: "概要", active: true }],
        body: <PortalBody />,
      };
      break;
    default:
      shellProps = {
        crumbRoutes: ["dashboard"],
        crumb: ["横浜ガレージ工房", "ダッシュボード"],
        pageTitle: "ダッシュボード",
        tabs: DASH_TABS,
        pageActions: <SecondaryBtn icon={<Ico.calendar style={{ width: 14, height: 14 }} />}>5/25 (日)</SecondaryBtn>,
        body: <LMain kpiOnly />,
      };
  }

  return (
    <div className="lp">
      <LShell3
        go={go}
        active={active}
        crumb={shellProps.crumb}
        crumbRoutes={shellProps.crumbRoutes}
        pageTitle={shellProps.pageTitle}
        pageMeta={shellProps.pageMeta}
        tabs={shellProps.tabs}
        pageActions={shellProps.pageActions}
        onCmdK={() => setCmdkOpen(true)}
        bodyKey={route}
      >
        {shellProps.body}
      </LShell3>
      {cmdkOpen && <CmdKModal go={go} onClose={() => setCmdkOpen(false)} />}
    </div>
  );
}
