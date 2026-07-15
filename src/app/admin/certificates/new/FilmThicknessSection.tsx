"use client";

import { useState } from "react";
import HelpTooltip from "@/components/ui/HelpTooltip";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { THICKNESS_LOCATION_PRESETS } from "@/lib/certificates/thicknessPanels";

type Row = {
  id: number;
  location: string;
  before_um: string;
  after_um: string;
  notes: string;
};

const LOCATION_PRESETS = THICKNESS_LOCATION_PRESETS;

type OcrReading = { location: string; before_um: number | null; after_um: number | null; notes: string };
type OcrResponse = { status?: string; readings?: OcrReading[]; notice?: string; message?: string };

// 車展開図の部位→座標マッピング（トップダウンビュー）
const DIAGRAM_POSITIONS: Record<string, { x: number; y: number }> = {
  ボンネット: { x: 150, y: 55 },
  ルーフ: { x: 150, y: 155 },
  右フロントフェンダー: { x: 255, y: 75 },
  左フロントフェンダー: { x: 45, y: 75 },
  右フロントドア: { x: 265, y: 135 },
  左フロントドア: { x: 35, y: 135 },
  右リアドア: { x: 265, y: 195 },
  左リアドア: { x: 35, y: 195 },
  右リアフェンダー: { x: 255, y: 245 },
  左リアフェンダー: { x: 45, y: 245 },
  "トランク/リアゲート": { x: 150, y: 275 },
  右サイドステップ: { x: 275, y: 165 },
  左サイドステップ: { x: 25, y: 165 },
};

let nextId = 1;
function newRow(): Row {
  return { id: nextId++, location: "", before_um: "", after_um: "", notes: "" };
}

const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

function CarDiagramSvg({ rows }: { rows: Row[] }) {
  // 部位ごとの after_um を取得
  const valueMap = new Map<string, string>();
  for (const r of rows) {
    if (r.location.trim() && r.after_um) {
      valueMap.set(r.location.trim(), r.after_um);
    }
  }

  return (
    <div className="rounded-xl border border-border-default bg-inset p-4">
      <p className="text-xs font-semibold text-muted mb-2">膜厚マップ（施工後 μm）</p>
      <svg viewBox="0 0 300 330" className="w-full max-w-[360px] mx-auto" aria-label="車両膜厚マップ">
        {/* 車体アウトライン（トップダウン） */}
        <path
          d="M100,20 Q90,20 85,30 L80,60 Q75,80 75,100 L75,260 Q75,280 85,290 L95,305 Q100,310 110,310 L190,310 Q200,310 205,305 L215,290 Q225,280 225,260 L225,100 Q225,80 220,60 L215,30 Q210,20 200,20 Z"
          fill="#f5f5f5"
          stroke="#d4d4d4"
          strokeWidth="1.5"
        />
        {/* フロントガラス */}
        <path d="M105,45 L195,45 L210,85 L90,85 Z" fill="#e0e7ff" stroke="#c7d2fe" strokeWidth="1" />
        {/* リアガラス */}
        <path d="M95,240 L205,240 L200,270 L100,270 Z" fill="#e0e7ff" stroke="#c7d2fe" strokeWidth="1" />
        {/* ドア分割線 */}
        <line x1="75" y1="165" x2="225" y2="165" stroke="#d4d4d4" strokeWidth="0.8" strokeDasharray="4,2" />
        {/* 左右分割線 */}
        <line x1="150" y1="20" x2="150" y2="310" stroke="#e5e5e5" strokeWidth="0.5" strokeDasharray="2,3" />

        {/* ミラー */}
        <ellipse cx="68" cy="90" rx="8" ry="5" fill="#d4d4d4" stroke="#a3a3a3" strokeWidth="0.8" />
        <ellipse cx="232" cy="90" rx="8" ry="5" fill="#d4d4d4" stroke="#a3a3a3" strokeWidth="0.8" />

        {/* 部位ラベル（値がある場合は数値を表示） */}
        {Object.entries(DIAGRAM_POSITIONS).map(([loc, pos]) => {
          const val = valueMap.get(loc);
          return (
            <g key={loc}>
              {val ? (
                <>
                  <rect x={pos.x - 18} y={pos.y - 8} width="36" height="16" rx="3" fill="#059669" opacity="0.9" />
                  <text x={pos.x} y={pos.y + 4} textAnchor="middle" className="text-[9px] font-bold fill-white">
                    {val}μm
                  </text>
                </>
              ) : (
                <text x={pos.x} y={pos.y + 3} textAnchor="middle" className="text-[7px] fill-neutral-400">
                  ―
                </text>
              )}
            </g>
          );
        })}

        {/* 方向表示 */}
        <text x="150" y="14" textAnchor="middle" className="text-[8px] fill-neutral-400 font-medium">
          ▲ フロント
        </text>
        <text x="150" y="326" textAnchor="middle" className="text-[8px] fill-neutral-400 font-medium">
          ▼ リア
        </text>
      </svg>
    </div>
  );
}

export default function FilmThicknessSection() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);

  const update = (id: number, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  // 膜厚計/測定シート写真を OCR して行を追記する。値は編集可能な下書き扱い（人が確認して確定）。
  const handleOcr = async (file: File | null) => {
    if (!file) return;
    setOcrMsg(null);
    setOcrBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/admin/certificates/thickness/ocr", { method: "POST", body: form });
      const j = await parseJsonSafe<OcrResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.status === "skipped") {
        setOcrMsg(j?.notice ?? "AI 自動入力が停止中のため、手動で入力してください。");
        return;
      }
      const readings = j?.readings ?? [];
      if (readings.length === 0) {
        setOcrMsg("読み取れる膜厚が見つかりませんでした。手動で入力してください。");
        return;
      }
      // 抽出行を追記。空の初期行が残っていれば置き換える。
      const imported: Row[] = readings.map((r) => ({
        id: nextId++,
        location: r.location ?? "",
        before_um: r.before_um != null ? String(r.before_um) : "",
        after_um: r.after_um != null ? String(r.after_um) : "",
        notes: r.notes ?? "",
      }));
      setRows((prev) => {
        const base = prev.filter((r) => r.location.trim() || r.before_um || r.after_um);
        return [...base, ...imported];
      });
      setOcrMsg(`${imported.length} 部位を取り込みました。内容を確認してください。`);
    } catch (e) {
      setOcrMsg("取り込みに失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcrBusy(false);
    }
  };

  const validRows = rows.filter((r) => r.location.trim() || r.before_um || r.after_um);
  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      location: r.location.trim(),
      before_um: r.before_um ? Number(r.before_um) : null,
      after_um: r.after_um ? Number(r.after_um) : null,
      notes: r.notes.trim(),
    })),
  );

  const hasAnyValue = rows.some((r) => r.after_um || r.before_um);

  return (
    <div className="space-y-4">
      <input type="hidden" name="film_thickness_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">FILM THICKNESS</div>
        <div className="mt-0.5 text-base font-semibold text-primary flex items-center gap-1.5 flex-wrap">
          膜厚計測
          <span className="text-xs font-normal text-muted">任意</span>
          <HelpTooltip>
            塗装の厚さを部位別に記録します。施工前 /
            施工後の数値を残すことで、コーティング層の存在を客観的に示せます。NexPTG等の膜厚計と連携すれば自動取り込みも可能。
          </HelpTooltip>
        </div>
        <p className="mt-1 text-xs text-muted">各部位の施工前後の膜厚（μm）を記録します。</p>
      </div>

      {/* 膜厚計/測定シートの写真から取り込み（カメラ直行）。取り込んだ値は編集可能。 */}
      <div className="space-y-1.5">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm text-secondary hover:border-border-strong ${
            ocrBusy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {ocrBusy ? "取り込み中…" : "膜厚計から取り込み"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            disabled={ocrBusy}
            onChange={(e) => {
              void handleOcr(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {ocrMsg && <p className="text-xs text-muted">{ocrMsg}</p>}
      </div>

      {/* 車展開図 */}
      {hasAnyValue && <CarDiagramSvg rows={rows} />}

      {/* ヘッダー行 */}
      <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 px-1">
        <span className="text-[11px] font-semibold text-muted uppercase">部位</span>
        <span className="text-[11px] font-semibold text-muted uppercase">施工前(μm)</span>
        <span className="text-[11px] font-semibold text-muted uppercase">施工後(μm)</span>
        <span className="text-[11px] font-semibold text-muted uppercase">備考</span>
        <span />
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 items-start rounded-xl border border-border-subtle bg-inset p-3 sm:p-0 sm:bg-transparent sm:border-0"
        >
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">部位</span>
            <input
              list={`loc-list-${row.id}`}
              value={row.location}
              onChange={(e) => update(row.id, "location", e.target.value)}
              placeholder="ボンネット"
              className={inputCls}
            />
            <datalist id={`loc-list-${row.id}`}>
              {LOCATION_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">施工前(μm)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={row.before_um}
              onChange={(e) => update(row.id, "before_um", e.target.value)}
              placeholder="例: 90"
              className={inputCls}
            />
          </div>
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">施工後(μm)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={row.after_um}
              onChange={(e) => update(row.id, "after_um", e.target.value)}
              placeholder="例: 110"
              className={inputCls}
            />
          </div>
          <div>
            <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">備考</span>
            <input
              value={row.notes}
              onChange={(e) => update(row.id, "notes", e.target.value)}
              placeholder="備考（任意）"
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            disabled={rows.length === 1}
            className="mt-1 self-center rounded-lg border border-border-default px-2 py-1.5 text-xs text-muted hover:border-red-200 hover:text-red-500 disabled:opacity-30 sm:mt-0"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-dashed border-border-default px-4 py-2 text-sm text-muted hover:border-border-strong hover:text-secondary"
      >
        ＋ 部位を追加
      </button>

      {validRows.length > 0 && (
        <div className="rounded-xl border border-border-default bg-inset p-3 text-xs text-muted">
          {validRows.length} 部位を記録します
        </div>
      )}
    </div>
  );
}
