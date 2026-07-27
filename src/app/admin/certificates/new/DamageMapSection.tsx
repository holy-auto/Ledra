"use client";

import { useRef, useState } from "react";
import {
  DAMAGE_KINDS,
  toNormalized,
  serializeDamageMap,
  type DamageKind,
  type DamageMarker,
} from "@/lib/certificates/damageMap";
import HelpTooltip from "@/components/ui/HelpTooltip";

/**
 * DamageMapSection
 * ------------------------------------------------------------
 * 車両展開図をタップして傷・損傷位置マーカーを置く自己完結セクション。
 * 座標は 0..1 正規化で `damage_map_json`（hidden input）に載せ、親フォームが
 * FormData で吸い上げる（body_repair_json / film_thickness_json と同じパターン）。
 * 実写真注釈と違い車両模式図に落とすので、保険査定等で位置が一目で伝わる。
 */

const KIND_COLOR: Record<DamageKind, string> = {
  scratch: "#f59e0b",
  dent: "#ef4444",
  paint: "#8b5cf6",
  rust: "#a16207",
  other: "#6b7280",
};

function kindLabel(kind: DamageKind): string {
  return DAMAGE_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

export default function DamageMapSection() {
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [kind, setKind] = useState<DamageKind>("scratch");
  const svgRef = useRef<SVGSVGElement>(null);
  const seq = useRef(0);

  const addMarkerAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { x, y } = toNormalized(clientX, clientY, rect);
    seq.current += 1;
    const id = `m${seq.current}-${Math.round(x * 1000)}-${Math.round(y * 1000)}`;
    setMarkers((prev) => [...prev, { id, x, y, kind, note: "" }]);
  };

  const removeMarker = (id: string) => setMarkers((prev) => prev.filter((m) => m.id !== id));
  const setNote = (id: string, note: string) =>
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, note } : m)));

  const jsonValue = serializeDamageMap({ version: 1, markers });

  return (
    <div className="space-y-3">
      <input type="hidden" name="damage_map_json" value={jsonValue} />

      <div>
        <div className="text-base font-semibold text-primary flex items-center gap-1.5 flex-wrap">
          傷・損傷マップ
          <span className="text-xs font-normal text-muted">任意</span>
          <HelpTooltip>
            車両図をタップして傷や凹みの位置を記録します。保険査定や施工前後の状態確認で、傷の位置が一目で伝わります。
          </HelpTooltip>
        </div>
        <p className="mt-1 text-xs text-muted">損傷種別を選び、車両図の該当箇所をタップしてください。</p>
      </div>

      {/* 種別セレクタ */}
      <div className="flex flex-wrap gap-1.5">
        {DAMAGE_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              kind === k.key
                ? "border-accent bg-accent-dim text-accent-text"
                : "border-border-default text-secondary hover:bg-surface-hover"
            }`}
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: KIND_COLOR[k.key] }}
            />
            {k.label}
          </button>
        ))}
      </div>

      {/* 車両図（タップで配置） */}
      <div className="rounded-xl border border-border-default bg-inset p-4">
        <svg
          ref={svgRef}
          viewBox="0 0 300 330"
          className="mx-auto w-full max-w-[360px] cursor-crosshair touch-none"
          aria-label="傷・損傷マップ（タップで位置を追加）"
          onClick={(e) => addMarkerAt(e.clientX, e.clientY)}
        >
          {/* 車体アウトライン（FilmThicknessSection と同じトップダウン図） */}
          <path
            d="M100,20 Q90,20 85,30 L80,60 Q75,80 75,100 L75,260 Q75,280 85,290 L95,305 Q100,310 110,310 L190,310 Q200,310 205,305 L215,290 Q225,280 225,260 L225,100 Q225,80 220,60 L215,30 Q210,20 200,20 Z"
            fill="#f5f5f5"
            stroke="#d4d4d4"
            strokeWidth="1.5"
          />
          <path d="M105,45 L195,45 L210,85 L90,85 Z" fill="#e0e7ff" stroke="#c7d2fe" strokeWidth="1" />
          <path d="M95,240 L205,240 L200,270 L100,270 Z" fill="#e0e7ff" stroke="#c7d2fe" strokeWidth="1" />
          <line x1="75" y1="165" x2="225" y2="165" stroke="#d4d4d4" strokeWidth="0.8" strokeDasharray="4,2" />
          <line x1="150" y1="20" x2="150" y2="310" stroke="#e5e5e5" strokeWidth="0.5" strokeDasharray="2,3" />
          <ellipse cx="68" cy="90" rx="8" ry="5" fill="#d4d4d4" stroke="#a3a3a3" strokeWidth="0.8" />
          <ellipse cx="232" cy="90" rx="8" ry="5" fill="#d4d4d4" stroke="#a3a3a3" strokeWidth="0.8" />

          {/* マーカー */}
          {markers.map((m, i) => (
            <g key={m.id}>
              <circle
                cx={m.x * 300}
                cy={m.y * 330}
                r="8"
                fill={KIND_COLOR[m.kind]}
                opacity="0.85"
                stroke="#fff"
                strokeWidth="1.5"
              />
              <text x={m.x * 300} y={m.y * 330 + 3} textAnchor="middle" className="fill-white text-[9px] font-bold">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* マーカー一覧（種別・備考編集・削除） */}
      {markers.length > 0 && (
        <ul className="space-y-1.5">
          {markers.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border-subtle p-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: KIND_COLOR[m.kind] }}
              >
                {i + 1}
              </span>
              <span className="w-16 shrink-0 text-xs text-secondary">{kindLabel(m.kind)}</span>
              <input
                value={m.note}
                onChange={(e) => setNote(m.id, e.target.value)}
                placeholder="メモ（任意）"
                maxLength={200}
                className="min-w-0 flex-1 rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary"
              />
              <button
                type="button"
                onClick={() => removeMarker(m.id)}
                className="shrink-0 text-muted hover:text-danger-text"
                aria-label="マーカーを削除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
