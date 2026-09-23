"use client";

import { useState } from "react";
import useSWR from "swr";
import MutationGuard from "@/components/ui/MutationGuard";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { fetcher } from "@/lib/swr";
import { dHappyPasteToCsv, modelCodeFromChassis } from "@/lib/pricing/laborMaster";

/**
 * 工数マスタ（型式 × 品番 → 工数 / 定額）の CSV 一括登録・一覧・削除。
 * 帳票フォームの「工賃を計算」がここを引く（工数 × 支店の時間単価）。
 */

type Entry = {
  id: string;
  model_code: string;
  part_number: string;
  label: string | null;
  hours: number | string | null;
  fixed_price: number | null;
  source_url: string | null;
};

const CSV_HEADER = "型式,品番(または作業名),工数h,定額円,名称,出典URL";
const CSV_EXAMPLE = `${CSV_HEADER}
JF5,08E25PH0C01,1.2,,ETC2.0車載器,
DG5,08E25PH0C01,1.5,,ETC2.0車載器,
*,ETCセットアップ,,3300,,
JF5,08B4032RA40B,0,,ナビ取付アタッチメント（本体取付に含む）,`;

export default function LaborHoursClient() {
  const [filter, setFilter] = useState("");
  const key = `/api/admin/labor-hours${filter.trim() ? `?model_code=${encodeURIComponent(filter.trim())}` : ""}`;
  const { data, mutate } = useSWR<{ entries: Entry[]; limit: number }>(key, fetcher);
  const entries = data?.entries ?? [];

  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [vin, setVin] = useState("");
  const [paste, setPaste] = useState("");

  const doImport = async (body: string = csv, preErrors: string[] = []) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/labor-hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: body }),
      });
      const j = await parseJsonSafe<{ imported?: number; errors?: string[]; message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const errs = [...preErrors, ...(j?.errors ?? [])];
      setMsg({
        text:
          `${j?.imported ?? 0} 件を登録・更新しました` +
          (errs.length ? `。スキップ ${errs.length} 件: ${errs.join(" / ")}` : ""),
        ok: errs.length === 0,
      });
      setCsv("");
      setPaste("");
      mutate();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (id: string) => {
    if (!confirm("この工数を削除しますか？")) return;
    const res = await fetch("/api/admin/labor-hours", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) alert("削除に失敗しました");
    mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">工数マスタ</h1>
        <p className="mt-1 text-sm text-secondary">
          型式ごと・品番ごとの取付工数です。帳票の「工賃を計算」で 工数 × 取引先店舗の時間単価 を自動入力します。
          時間単価は顧客詳細の「支店」で店舗ごとに、未設定なら設定画面のレバーレートを使います。
        </p>
      </div>

      {msg && (
        <div role="status" className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </div>
      )}

      <MutationGuard>
        <section className="glass-card space-y-3 p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">d-Happy の表を貼り付けて登録</div>
          <p className="text-xs text-secondary">
            d-Happy で車台番号を検索し、装着用品を選んで「装着用品確認」を開きます。表の「項目」から最後の行までを
            ドラッグで選んでコピーし、下に貼り付けてください。品番ごとの取付工数をこの型式で登録します。
          </p>
          <input
            className="input-field !w-56"
            placeholder="車台番号 GP3-1017220 または型式 GP3"
            aria-label="車台番号または型式"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
          />
          <textarea
            className="input-field font-mono text-xs"
            rows={6}
            placeholder={
              "項目\t価格\t取付工数\t合計金額\nドアバイザー（フロント／リア４枚セット）\n08R04SYY001\t9,900\t0.4\t\n13,860"
            }
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !paste.trim() || !vin.trim()}
            onClick={() => {
              const { csv: converted, count, errors } = dHappyPasteToCsv(paste, modelCodeFromChassis(vin) ?? vin);
              if (count === 0) return setMsg({ text: errors.join(" / "), ok: false });
              void doImport(converted, errors);
            }}
          >
            {busy ? "登録中…" : "貼り付けから登録"}
          </button>
        </section>
      </MutationGuard>

      <MutationGuard>
        <section className="glass-card space-y-3 p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CSV で登録・更新</div>
          <p className="text-xs text-secondary">
            列: {CSV_HEADER}。工数か定額のどちらかは必須。型式を問わない作業は型式を「*」に。
            同じ型式・品番は上書きされます。
          </p>
          <textarea
            className="input-field font-mono text-xs"
            rows={8}
            placeholder={CSV_EXAMPLE}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <button type="button" className="btn-primary" disabled={busy || !csv.trim()} onClick={() => void doImport()}>
            {busy ? "登録中…" : "登録"}
          </button>
        </section>
      </MutationGuard>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-5">
          <div className="text-base font-semibold text-primary">登録済み ({entries.length}件)</div>
          <input
            className="input-field !w-40"
            placeholder="型式で絞り込み"
            aria-label="型式で絞り込み"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2">型式</th>
                <th className="px-3 py-2">品番 / 作業名</th>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2 text-right">工数h</th>
                <th className="px-3 py-2 text-right">定額</th>
                <th className="px-3 py-2">出典</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2 font-mono">{e.model_code === "*" ? "共通" : e.model_code}</td>
                  <td className="px-3 py-2 font-mono">{e.part_number}</td>
                  <td className="px-3 py-2">{e.label}</td>
                  <td className="px-3 py-2 text-right">{e.hours ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    {e.fixed_price != null ? e.fixed_price.toLocaleString() : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.source_url && /^https?:\/\//.test(e.source_url) && (
                      <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                        リンク
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <MutationGuard>
                      <button
                        type="button"
                        className="btn-danger px-3 py-1 text-xs"
                        onClick={() => void doDelete(e.id)}
                      >
                        削除
                      </button>
                    </MutationGuard>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted">
                    まだ登録がありません。上の CSV から登録してください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
