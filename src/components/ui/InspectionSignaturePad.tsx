"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  onSign: (dataUrl: string, signerName: string) => Promise<void>;
  onCancel: () => void;
  orderTitle: string;
}

export default function InspectionSignaturePad({ onSign, onCancel, orderTitle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Canvas の解像度を DPR に合わせる
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1a1f36";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  }, [drawing]);

  const endDraw = useCallback(() => {
    setDrawing(false);
    lastPos.current = null;
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setSubmitting(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSign(dataUrl, signerName);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[11px] font-medium tracking-widest text-muted uppercase">検収確認</p>
          <h2 className="text-base font-semibold text-primary mt-0.5">電子サインで検収承認</h2>
          <p className="text-xs text-secondary mt-1 line-clamp-1">{orderTitle}</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Signer name */}
          <div className="space-y-1">
            <label className="text-xs text-muted">署名者名（任意）</label>
            <input
              type="text"
              className="input-field text-sm"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="例: 山田 太郎"
            />
          </div>

          {/* Signature canvas */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">サイン欄（指またはペンで署名してください）</label>
              {hasStrokes && (
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  クリア
                </button>
              )}
            </div>
            <div className="rounded-xl border-2 border-dashed border-border bg-white overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ height: 160, display: "block", cursor: "crosshair" }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
            </div>
            {!hasStrokes && (
              <p className="text-[11px] text-muted text-center">↑ ここにサインしてください</p>
            )}
          </div>

          <p className="text-[11px] text-muted leading-relaxed">
            このサインにより、上記の作業内容を検収承認したことを確認します。
            サインは記録として保存されます。
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={onCancel}
            disabled={submitting}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={handleSubmit}
            disabled={!hasStrokes || submitting}
          >
            {submitting ? "処理中..." : "署名して検収承認"}
          </button>
        </div>
      </div>
    </div>
  );
}
