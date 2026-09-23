"use client";

import { useState } from "react";
import useSWR, { mutate as mutateKey } from "swr";
import LaborCoveragePanel, { COVERAGE_KEY } from "./LaborCoveragePanel";
import MutationGuard from "@/components/ui/MutationGuard";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { fetcher } from "@/lib/swr";
import { readXlsxRows } from "@/lib/pricing/readXlsxRows";
import {
  dHappyPasteToCsv,
  sheetRowsToLaborCsv,
  describeConflict,
  formatImportSummary,
  modelCodeFromChassis,
  type LaborImportResult,
} from "@/lib/pricing/laborMaster";

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

  // 前回の登録で値を上書きした行（あとから入ってきた値を採る。何が変わったかを見せるだけ）
  const [overwritten, setOverwritten] = useState<string[]>([]);

  // 添付ファイル（Excel / CSV）を行に分け、工数 CSV に変換して同じ登録処理に流す
  const importFile = async (file: File) => {
    setMsg(null);
    setOverwritten([]);
    try {
      let rows: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        rows = await readXlsxRows(await file.arrayBuffer());
      } else {
        const buf = await file.arrayBuffer();
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
        } catch {
          text = new TextDecoder("shift_jis").decode(buf); // Excel で保存した CSV は Shift_JIS のことが多い
        }
        // ponytail: CSV は全カンマで分割（parseLaborCsv と同じ）。天井: クォート内カンマは不可
        rows = text
          .replace(/^\uFEFF/, "")
          .split(/\r?\n/)
          .map((l) => l.split(",").map((c) => c.replace(/^"(.*)"$/, "$1")));
      }
      const { csv: converted, count, errors, overwritten: inFile } = sheetRowsToLaborCsv(rows);
      if (count === 0) return setMsg({ text: errors.join(" / ") || "登録できる行がありません", ok: false });
      await doImport(
        converted,
        errors,
        inFile.map((c) => `ファイル内で食い違い: ${c}`),
      );
    } catch (e) {
      setMsg({ text: `ファイルを読めませんでした: ${e instanceof Error ? e.message : String(e)}`, ok: false });
    }
  };

  const doImport = async (body: string = csv, preErrors: string[] = [], preOverwritten: string[] = []) => {
    setBusy(true);
    setMsg(null);
    setOverwritten([]);
    try {
      const res = await fetch("/api/admin/labor-hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: body }),
      });
      const j = await parseJsonSafe<LaborImportResult & { message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const errors = [...preErrors, ...(j?.errors ?? [])];
      setMsg({ text: formatImportSummary({ ...j, errors }), ok: errors.length === 0 });
      setOverwritten([...preOverwritten, ...(j?.overwritten ?? []).map(describeConflict)]);
      setCsv("");
      setPaste("");
      mutate();
      void mutateKey(COVERAGE_KEY);
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
    void mutateKey(COVERAGE_KEY);
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

      <LaborCoveragePanel />

      {overwritten.length > 0 && (
        <section className="glass-card space-y-2 p-5">
          <div className="text-sm font-semibold text-primary">
            値が食い違った {overwritten.length} 件は、あとから入ってきた値で上書きしました
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-secondary">
            {overwritten.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
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
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">ファイル（Excel / CSV）で登録・更新</div>
          <p className="text-xs text-secondary">
            Excel（.xlsx）か CSV を選ぶと、そのまま登録します。対応する形は2つ: 「{CSV_HEADER}」の列、または d-Happy
            収集表（項目・取付工数・車台番号の列。型式は車台番号から取ります）。
            登録済みの型式・品番と値が違う行は今回の値で上書きし、一覧に出します。同じファイル内で同じ型式・品番が複数あるときは後の行を採ります（d-Happy
            収集表は食い違いも一覧に出します）。
          </p>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-secondary hover:border-border-strong ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            📎 {busy ? "登録中…" : "ファイルを選んで登録"}
            <input
              type="file"
              accept=".xlsx,.csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
          </label>
          <p className="text-xs text-muted">または CSV を下に貼り付け:</p>
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
