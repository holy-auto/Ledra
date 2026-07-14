"use client";
import { useMemo, useState } from "react";
import { formatJpy } from "@/lib/format";
import { DOC_TYPES, type DocType, type DocumentRow } from "@/types/document";

// キャンセル・却下・下書きは集計対象から除外する。
// キャンセル/却下は実質発生しなかった帳票、下書きは未送付でまだ確定していない金額のため、
// 他の分析（RevenueAnalytics の estimatePipeline 等）と同様に実績合計には含めない。
const VOID_STATUSES = new Set(["cancelled", "rejected", "draft"]);
const UNPAID_STATUSES = new Set(["sent", "overdue", "accepted"]);

const CHART_COLORS = [
  "var(--accent-blue)",
  "var(--accent-violet)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
];

type CustomerGroup = {
  customerId: string;
  customerName: string;
  docs: DocumentRow[];
};

function sumTotal(docs: DocumentRow[]) {
  return docs.filter((d) => !VOID_STATUSES.has(d.status)).reduce((s, d) => s + d.total, 0);
}

export default function CustomerSummaryPanel({
  docs,
  filterScopeLabel,
}: {
  docs: DocumentRow[];
  /** 一覧側の種別/ステータス絞り込みが有効な場合、その内容（例:「見積書 / 入金済」）。有効時はその旨を明示する。 */
  filterScopeLabel?: string | null;
}) {
  const customerGroups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const d of docs) {
      if (!d.customer_id) continue;
      const existing = map.get(d.customer_id);
      if (existing) existing.docs.push(d);
      else
        map.set(d.customer_id, {
          customerId: d.customer_id,
          customerName: d.customer_name || "顧客名未設定",
          docs: [d],
        });
    }
    return Array.from(map.values()).sort((a, b) => sumTotal(b.docs) - sumTotal(a.docs));
  }, [docs]);

  const [activeCustomerId, setActiveCustomerId] = useState("__all__");

  if (docs.length === 0 || customerGroups.length === 0) return null;

  // 絞り込み変更や削除等で選択中の顧客が候補から消えた場合、「すべて」に自動で戻す
  // （消えたタブがハイライトされたまま空表示になるのを防ぐ）。
  const activeGroup = customerGroups.find((g) => g.customerId === activeCustomerId);
  const effectiveActiveId = activeGroup ? activeCustomerId : "__all__";
  const activeDocs = effectiveActiveId === "__all__" ? docs : (activeGroup?.docs ?? docs);

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">顧客別集計</div>
        <div className="mt-0.5 text-[15px] font-semibold text-primary">顧客ごとの帳票サマリー</div>
        {filterScopeLabel && (
          <div className="mt-1 text-[11px] text-warning-text">
            現在の絞り込み条件（{filterScopeLabel}）を反映しています。他の帳票は集計に含まれません。
          </div>
        )}
      </div>

      {/* 顧客タブ */}
      <div className="flex gap-1 overflow-x-auto border-b border-border-subtle p-3">
        <button
          type="button"
          onClick={() => setActiveCustomerId("__all__")}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            effectiveActiveId === "__all__" ? "bg-accent-dim text-accent" : "text-secondary hover:text-primary"
          }`}
        >
          すべて
        </button>
        {customerGroups.map((g) => (
          <button
            key={g.customerId}
            type="button"
            onClick={() => setActiveCustomerId(g.customerId)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              effectiveActiveId === g.customerId ? "bg-accent-dim text-accent" : "text-secondary hover:text-primary"
            }`}
          >
            {g.customerName}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-5">
        <SummaryTable docs={activeDocs} />
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendChart docs={activeDocs} />
          <BreakdownChart docs={activeDocs} />
        </div>
      </div>
    </section>
  );
}

function SummaryTable({ docs }: { docs: DocumentRow[] }) {
  const rows = useMemo(() => {
    const byType = new Map<DocType, { count: number; total: number; unpaid: number }>();
    for (const d of docs) {
      if (VOID_STATUSES.has(d.status)) continue;
      const row = byType.get(d.doc_type) ?? { count: 0, total: 0, unpaid: 0 };
      row.count += 1;
      row.total += d.total;
      if (UNPAID_STATUSES.has(d.status)) row.unpaid += d.total;
      byType.set(d.doc_type, row);
    }
    return Array.from(byType.entries())
      .map(([docType, v]) => ({ docType, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [docs]);

  if (rows.length === 0) {
    return <p className="text-xs text-muted">帳票がありません</p>;
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandCount = rows.reduce((s, r) => s + r.count, 0);
  const grandUnpaid = rows.reduce((s, r) => s + r.unpaid, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[12px]">
        <thead>
          <tr>
            <th className="text-left py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">種別</th>
            <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">件数</th>
            <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">合計金額</th>
            <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">未入金額</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <tr key={r.docType}>
              <td className="py-2 px-2 text-secondary font-medium">{DOC_TYPES[r.docType]?.label ?? r.docType}</td>
              <td className="py-2 px-2 text-right text-muted">{r.count}</td>
              <td className="py-2 px-2 text-right text-primary font-semibold">{formatJpy(r.total)}</td>
              <td className="py-2 px-2 text-right text-secondary">{r.unpaid > 0 ? formatJpy(r.unpaid) : "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-subtle bg-accent-dim">
            <td className="py-2 px-2 font-semibold text-primary">合計</td>
            <td className="py-2 px-2 text-right font-semibold text-primary">{grandCount}</td>
            <td className="py-2 px-2 text-right font-semibold text-primary">{formatJpy(grandTotal)}</td>
            <td className="py-2 px-2 text-right font-semibold text-primary">
              {grandUnpaid > 0 ? formatJpy(grandUnpaid) : "-"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TrendChart({ docs }: { docs: DocumentRow[] }) {
  const months = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const d of docs) {
      if (VOID_STATUSES.has(d.status)) continue;
      const dateStr = d.issued_at || d.created_at;
      if (!dateStr) continue;
      const key = dateStr.slice(0, 7); // YYYY-MM
      const row = map.get(key) ?? { total: 0, count: 0 };
      row.total += d.total;
      row.count += 1;
      map.set(key, row);
    }
    return (
      Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        // 活動月のみの集計（空白月は詰めない）のため、直近6件が複数年にまたがることがある。
        // 月のみだと同じ月が年をまたいで重複表示され得るため、年（下2桁）も表示する。
        .map(([key, v]) => ({ key, label: `${key.slice(2, 4)}年${parseInt(key.slice(5, 7), 10)}月`, ...v }))
    );
  }, [docs]);

  const maxVal = Math.max(...months.map((m) => m.total), 1);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="text-[11px] font-semibold text-primary">金額推移（直近{months.length}か月）</div>
      {months.length === 0 ? (
        <p className="text-xs text-muted">データがありません</p>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {months.map((m) => {
            const height = maxVal > 0 ? (m.total / maxVal) * 100 : 0;
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[9px] text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {formatJpy(m.total)}
                </div>
                <div
                  className="w-full rounded-t-lg min-h-[4px] transition-all duration-500 ease-out"
                  style={{
                    height: `${Math.max(height, 3)}%`,
                    background: "linear-gradient(180deg, var(--accent-blue), var(--accent-violet))",
                  }}
                />
                <div className="text-[10px] text-muted">{m.label}</div>
                <div className="text-[9px] text-muted">{m.count}件</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BreakdownChart({ docs }: { docs: DocumentRow[] }) {
  const { total, rows } = useMemo(() => {
    const map = new Map<DocType, number>();
    let sum = 0;
    for (const d of docs) {
      if (VOID_STATUSES.has(d.status)) continue;
      map.set(d.doc_type, (map.get(d.doc_type) ?? 0) + d.total);
      sum += d.total;
    }
    return {
      total: sum,
      rows: Array.from(map.entries())
        .map(([docType, amount]) => ({ docType, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [docs]);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="text-[11px] font-semibold text-primary">種別内訳</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">データがありません</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <div key={r.docType} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-secondary">{DOC_TYPES[r.docType]?.label ?? r.docType}</span>
                  <span className="text-muted">
                    {formatJpy(r.amount)}（{pct.toFixed(1)}%）
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border-default)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                      background: CHART_COLORS[idx % CHART_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
