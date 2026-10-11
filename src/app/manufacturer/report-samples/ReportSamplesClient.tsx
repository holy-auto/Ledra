"use client";

import { useState } from "react";
import Tabs from "@/components/ui/Tabs";
import { DAMAGE_DIAGRAM } from "@/lib/certificates/damageMap";
import { SAMPLE_REPORTS, fmt, sum, type Chart, type Pair, type Section, type Src } from "./sampleData";

const SERIES = ["var(--accent-blue)", "var(--accent-emerald)", "var(--text-muted)", "var(--accent-gold)"];
const TONE = {
  accent: "var(--accent-blue)",
  emerald: "var(--accent-emerald)",
  gold: "var(--accent-gold)",
  amber: "var(--accent-amber)",
};

function SrcTags({ src }: { src: Src[] }) {
  return (
    <div className="flex gap-1">
      {src.map((s) => (
        <span
          key={s}
          className={`rounded-full border px-2 text-[11px] leading-5 ${
            s === "field" ? "border-accent text-accent" : "border-success text-success-text"
          }`}
        >
          {s === "field" ? "現場" : "車両"}
        </span>
      ))}
    </div>
  );
}

function Bar({ label, width, color, value }: { label: string; width: number; color: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(84px,9.5em)_1fr_auto] items-center gap-2.5 text-xs">
      <span className="text-secondary">{label}</span>
      <span className="h-3.5 overflow-hidden rounded-sm bg-surface-hover">
        <span className="block h-full" style={{ width: `${width}%`, background: color }} />
      </span>
      <span className="min-w-[4.5em] text-right font-mono tabular-nums text-primary">{value}</span>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-secondary">
      {items.map(([l, c]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Columns({ items, highlight }: { items: Pair[]; highlight?: number }) {
  const m = Math.max(...items.map((x) => x[1]));
  return (
    <div>
      <div className="flex h-44 items-end gap-2 border-b border-border-subtle">
        {items.map(([l, v], i) => (
          <div key={l} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[11px] tabular-nums text-secondary">{fmt(v)}</span>
            <span
              className="w-full max-w-[46px] rounded-t-sm"
              style={{ height: Math.round((v / m) * 128), background: i === highlight ? TONE.gold : TONE.accent }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-center text-[11px] text-muted">
        {items.map(([l]) => (
          <span key={l} className="flex-1">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function Damage({ points }: { points: [string, number, number, number][] }) {
  const m = Math.max(...points.map((p) => p[3]));
  const total = sum(points.map((p) => p[3]));
  const ranked = [...points].sort((a, b) => b[3] - a[3]).slice(0, 5);
  const { width: W, height: H } = DAMAGE_DIAGRAM;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
      {/* 証明書の作成画面・PDF・公開ページと同じ車両図に、正規化座標のまま重ねる */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="傷の位置の集計（車両図）"
        className="mx-auto w-full max-w-[240px]"
      >
        <path d={DAMAGE_DIAGRAM.body} fill="var(--bg-inset)" stroke="var(--border-default)" strokeWidth="2" />
        <path d={DAMAGE_DIAGRAM.windshield} fill="var(--bg-surface-solid)" stroke="var(--border-default)" />
        <path d={DAMAGE_DIAGRAM.rearWindow} fill="var(--bg-surface-solid)" stroke="var(--border-default)" />
        {points.map(([l, x, y, n]) => (
          <g key={l}>
            <circle
              cx={x * W}
              cy={y * H}
              r={5 + Math.sqrt(n / m) * 11}
              fill="var(--accent-red)"
              fillOpacity={0.25 + (n / m) * 0.55}
              stroke="var(--accent-red)"
            >
              <title>{`${l} ${n}個`}</title>
            </circle>
            <text
              x={x * W}
              y={y * H + 4}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-primary)"
              className="font-mono"
            >
              {n}
            </text>
          </g>
        ))}
      </svg>
      <div className="grid gap-2">
        {ranked.map(([l, , , n]) => (
          <Bar
            key={l}
            label={l}
            width={(n / m) * 100}
            color="var(--accent-red)"
            value={`${n}（${((n / total) * 100).toFixed(1)}%）`}
          />
        ))}
      </div>
    </div>
  );
}

function ChartView({ chart }: { chart: Chart }) {
  switch (chart.kind) {
    case "bars": {
      const m = chart.max ?? Math.max(...chart.items.map((x) => x[1]));
      const color = TONE[chart.tone ?? "accent"];
      return (
        <div className="grid gap-2">
          {chart.items.map(([l, v]) => (
            <Bar
              key={l}
              label={l}
              width={(v / m) * 100}
              color={color}
              value={`${fmt(v)}${chart.unit ?? ""}${chart.total ? `（${((v / chart.total) * 100).toFixed(1)}%）` : ""}`}
            />
          ))}
        </div>
      );
    }
    case "stacked": {
      const m = Math.max(...chart.rows.map((r) => sum(r[1])));
      return (
        <div className="grid gap-2.5">
          <Legend items={chart.series.map((s, i) => [s, SERIES[i]])} />
          {chart.rows.map(([l, vs]) => (
            <div key={l} className="grid grid-cols-[minmax(84px,9.5em)_1fr_auto] items-center gap-2.5 text-xs">
              <span className="text-secondary">{l}</span>
              <span className="flex h-3.5 overflow-hidden rounded-sm" style={{ width: `${(sum(vs) / m) * 100}%` }}>
                {vs.map((v, i) => (
                  <span
                    key={i}
                    title={`${chart.series[i]} ${v}`}
                    style={{ width: `${(v / sum(vs)) * 100}%`, background: SERIES[i] }}
                  />
                ))}
              </span>
              <span className="min-w-[4.5em] text-right font-mono tabular-nums">{fmt(sum(vs))}</span>
            </div>
          ))}
        </div>
      );
    }
    case "columns":
      return <Columns items={chart.items} highlight={chart.highlight} />;
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="min-w-full divide-y divide-border-subtle text-xs">
            <thead className="bg-surface-hover text-secondary">
              <tr>
                {chart.head.map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-semibold ${chart.right?.includes(i) ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {chart.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) => (
                    <td
                      key={i}
                      className={`px-3 py-2 ${chart.right?.includes(i) ? "text-right" : ""} ${typeof c === "number" ? "font-mono tabular-nums" : ""}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "thickness": {
      const tm = Math.max(...chart.items.map((x) => x[2])) * 1.1;
      return (
        <div className="grid gap-2.5">
          <Legend
            items={[
              ["補修前（µm）", "var(--text-muted)"],
              ["補修後（µm）", TONE.accent],
            ]}
          />
          {chart.items.map(([l, b, a]) => (
            <div key={l} className="grid grid-cols-[minmax(84px,9.5em)_1fr_auto] items-center gap-2.5 text-xs">
              <span className="text-secondary">{l}</span>
              <span className="grid gap-[3px]">
                {[
                  [b, "var(--text-muted)"],
                  [a, TONE.accent],
                ].map(([v, c]) => (
                  <span key={c} className="h-2 overflow-hidden rounded-sm bg-surface-hover">
                    <span className="block h-full" style={{ width: `${(Number(v) / tm) * 100}%`, background: c }} />
                  </span>
                ))}
              </span>
              <span className="min-w-[4.5em] text-right font-mono tabular-nums">
                {b}→{a} <span className="text-muted">+{a - b}</span>
              </span>
            </div>
          ))}
        </div>
      );
    }
    case "timeline": {
      const t = sum(chart.items.map((s) => s[1]));
      const cs = ["var(--text-muted)", TONE.gold, TONE.emerald, TONE.accent, "var(--accent-violet)"];
      return (
        <div className="grid gap-2">
          <div
            className="flex h-8 overflow-hidden rounded"
            role="img"
            aria-label={`工程別の平均日数 合計${t.toFixed(1)}日`}
          >
            {chart.items.map(([l, d], i) => (
              <div key={l} title={`${l} ${d}日`} style={{ width: `${(d / t) * 100}%`, background: cs[i] }} />
            ))}
          </div>
          <Legend items={chart.items.map(([l, d], i) => [`${l} ${d}日`, cs[i]])} />
        </div>
      );
    }
    case "damage":
      return <Damage points={chart.points} />;
  }
}

function SectionView({ s }: { s: Section }) {
  return (
    <section className="grid min-w-0 content-start gap-2.5">
      <SrcTags src={s.src} />
      <h3 className="text-[15px] font-semibold text-primary">{s.title}</h3>
      {s.lead && <p className="text-xs text-secondary">{s.lead}</p>}
      {s.charts.map((c, i) => (
        <ChartView key={i} chart={c} />
      ))}
      {s.note && <p className="text-xs text-muted">{s.note}</p>}
    </section>
  );
}

export default function ReportSamplesClient() {
  const [id, setId] = useState(SAMPLE_REPORTS[0].id);
  const r = SAMPLE_REPORTS.find((x) => x.id === id) ?? SAMPLE_REPORTS[0];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed border-accent-gold px-4 py-2.5 text-xs text-accent-gold-text">
        ※ <b className="font-semibold">数値・メーカー名・車種名・店舗名はすべて説明用のダミーです。</b>
        実在の企業・実績を示すものではありません。項目は Ledra
        に実在するデータ項目だけで組んでいます（各レポート末尾の「データの出どころ」参照）。
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          [
            "field",
            "現場データ",
            "施工証明書・施工部位・使用製品の品番とロット番号・PPF部位・膜厚・傷の位置・写真・工程の日時・部品交換・実証テストの検査と不具合",
          ],
          ["vehicle", "車両データ", "メーカー・車種・年式・ボディサイズ・車台番号・走行距離の記録・車検満了日"],
          [
            "out",
            "メーカー向けレポート",
            "どの車に・どの店で・どの製品が・どう使われ・どうなったか。個人が特定できない集計で提供",
          ],
        ].map(([k, t, d]) => (
          <div key={k} className="rounded-2xl border border-border-subtle bg-surface p-4">
            <div className="text-sm font-semibold text-primary">{t}</div>
            <p className="mt-1 text-xs text-secondary">{d}</p>
          </div>
        ))}
      </div>

      <Tabs
        ariaLabel="メーカーの業種"
        value={r.id}
        onChange={setId}
        tabs={SAMPLE_REPORTS.map((x) => ({
          key: x.id,
          label: (
            <>
              {x.tab}
              <small className="ml-1.5 text-[11px] text-muted">{x.sub}</small>
            </>
          ),
        }))}
      />

      <article
        role="tabpanel"
        aria-label={r.tab}
        className="grid gap-7 rounded-2xl border border-border-subtle bg-surface p-5 lg:p-7"
      >
        <header className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-b-2 border-accent-gold pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Sample Report</span>
              <span className="rounded-full bg-warning-dim px-2 py-0.5 text-[11px] font-medium text-warning-text">
                ダミーデータ（実在の企業・実績ではありません）
              </span>
            </div>
            <div className="font-serif text-xl font-semibold text-primary">{r.to}</div>
            <div className="text-[13px] text-secondary">{r.title}</div>
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-3 gap-y-0.5 text-xs">
            {[...r.meta, ["作成", "Ledra"]].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-primary">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {r.kpis.map((k) => (
            <div key={k.label} className="grid gap-0.5 rounded-xl border border-border-subtle p-3.5">
              <span className="font-mono text-2xl tabular-nums text-primary">
                {k.value}
                <small className="ml-0.5 text-[13px] text-muted">{k.unit}</small>
              </span>
              <span className="text-xs text-secondary">{k.label}</span>
              <SrcTags src={k.src} />
            </div>
          ))}
        </div>

        {r.rows.map((row, i) => (
          <div key={i} className={`grid gap-x-7 gap-y-6 ${row.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {row.map((s) => (
              <SectionView key={s.title} s={s} />
            ))}
          </div>
        ))}

        <div className="grid gap-2.5 rounded-xl bg-[var(--bg-inset)] p-4">
          <h3 className="text-[15px] font-semibold text-primary">この掛け合わせで分かること</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-primary">
            {r.insights.map(([h, b]) => (
              <li key={h}>
                <b className="font-semibold">{h}</b>: {b}
              </li>
            ))}
          </ol>
        </div>

        <section className="grid gap-2.5">
          <h3 className="text-[15px] font-semibold text-primary">データの出どころ</h3>
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="min-w-full divide-y divide-border-subtle text-xs">
              <thead className="bg-surface-hover text-secondary">
                <tr>
                  {["指標", "現場データ", "車両データ", "状態"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {r.sources.map(([m, f, v, ok]) => (
                  <tr key={m}>
                    <td className="px-3 py-2 text-primary">{m}</td>
                    <td className="px-3 py-2 text-secondary">{f}</td>
                    <td className="px-3 py-2 text-secondary">{v}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ok ? "bg-success-dim text-success-text" : "bg-warning-dim text-warning-text"
                        }`}
                      >
                        {ok ? "記録済み" : "提携時に用意"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            「記録済み」は Ledra
            に既にある項目。「提携時に用意」は、集計の作り込み・データの範囲・同意・連携方法を提携時に決めてから出せる項目。
          </p>
        </section>
      </article>

      <div className="space-y-1.5 text-xs text-muted">
        <p>
          共通の前提:
          顧客名・ナンバーはレポートに出しません。車台番号は下4桁のみ表示します。どの範囲のデータを出すかは、提携時に施工店・車両所有者の同意範囲とあわせて契約で決めます。
        </p>
        <p>このページは見本です。車両データとの掛け合わせ集計は、提携時にメーカーごとに用意します。</p>
      </div>
    </div>
  );
}
