"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { splitChassisInput, summarizeCoverage } from "@/lib/pricing/laborMaster";

/**
 * 型式ごとの工数収集状況。登録車両の車台番号と、貼り付けた車台番号を型式にまとめ、
 * 工数マスタに行が無い型式を「未収集」として先頭に出す。未収集分の車台番号は
 * コピーして d-Happy での収集（人の操作・ブラウザ拡張）に渡す。
 */

export const COVERAGE_KEY = "/api/admin/labor-hours/coverage";

type CoverageResponse = { registered_rows_by_model: Record<string, number>; vehicle_chassis: string[] };

export default function LaborCoveragePanel() {
  const { data } = useSWR<CoverageResponse>(COVERAGE_KEY, fetcher);
  const [pasted, setPasted] = useState("");

  const { rows, unparsed } = useMemo(() => {
    const pastedChassis = splitChassisInput(pasted);
    const { rows } = summarizeCoverage(
      [...(data?.vehicle_chassis ?? []), ...pastedChassis],
      data?.registered_rows_by_model ?? {},
    );
    // 型式が分からない番号の警告は、この欄に貼ったものだけ（登録車両の 17 桁 VIN 等は直せないので出さない）
    return { rows, unparsed: summarizeCoverage(pastedChassis, {}).unparsed };
  }, [data, pasted]);
  const pending = rows.filter((r) => r.registered_rows === 0);
  const [copied, setCopied] = useState(false);

  const copyPending = async () => {
    try {
      await navigator.clipboard.writeText(pending.map((r) => r.sample_chassis).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("コピーできませんでした。一覧から手で選んでコピーしてください。");
    }
  };

  return (
    <section className="glass-card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">型式ごとの収集状況</div>
          <div className="mt-1 text-sm text-primary">
            未収集 {pending.length} 型式 / 全 {rows.length} 型式
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={pending.length === 0}
          onClick={() => void copyPending()}
        >
          {copied ? "コピーしました" : `未収集の車台番号をコピー（${pending.length}台）`}
        </button>
      </div>
      <p className="text-xs text-secondary">
        登録済みの車両に加え、下に貼り付けた車台番号（型式付き、例: JF5-1511014）を型式ごとにまとめます。
        未収集の型式は1台ずつ車台番号を出すので、d-Happy で検索して工数を登録してください。
      </p>
      <textarea
        className="input-field font-mono text-xs"
        rows={3}
        placeholder={"JF5-1511014\nDG5-1204166"}
        aria-label="収集したい車台番号"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      {unparsed.length > 0 && (
        <p className="text-xs text-warning">型式が分からない番号（型式付きで入れてください）: {unparsed.join("、")}</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3">型式</th>
                <th className="py-2 pr-3">車台番号の例</th>
                <th className="py-2 pr-3 text-right">台数</th>
                <th className="py-2">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.model_code}>
                  <td className="py-2 pr-3 font-mono">{r.model_code}</td>
                  <td className="py-2 pr-3 font-mono">{r.sample_chassis}</td>
                  <td className="py-2 pr-3 text-right">{r.vehicle_count}</td>
                  <td className="py-2">
                    {r.registered_rows > 0 ? (
                      <span className="text-success">収集済み（{r.registered_rows}件）</span>
                    ) : (
                      <span className="text-warning">未収集</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
