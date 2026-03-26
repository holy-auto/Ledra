"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";

export interface VehicleSizeOCRResult {
  size_class: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  maker?: string;
  model?: string;
}

interface VehicleSizeOCRProps {
  onResult: (result: VehicleSizeOCRResult) => void;
}

interface OcrApiResponse {
  ok: boolean;
  size_class: string | null;
  volume_m3: number | null;
  dimensions: {
    length_mm: number;
    width_mm: number;
    height_mm: number;
  } | null;
  parsed: {
    maker: string | null;
    model: string | null;
    vin: string | null;
    weight_kg: number | null;
    displacement_cc: number | null;
    first_registration: string | null;
  };
  master_size_class: string | null;
  message?: string;
}

export default function VehicleSizeOCR({ onResult }: VehicleSizeOCRProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrApiResponse | null>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/admin/vehicle-size/ocr", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as OcrApiResponse;

      if (!res.ok) {
        setError(json.message ?? "OCR処理中にエラーが発生しました。");
        return;
      }

      setResult(json);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleApply = () => {
    if (!result?.dimensions || !result.size_class) return;
    onResult({
      size_class: result.size_class,
      length_mm: result.dimensions.length_mm,
      width_mm: result.dimensions.width_mm,
      height_mm: result.dimensions.height_mm,
      maker: result.parsed?.maker ?? undefined,
      model: result.parsed?.model ?? undefined,
    });
    setResult(null);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={loading}
        onClick={handleClick}
      >
        {loading ? "読み取り中..." : "車検証から判定"}
      </Button>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {result && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm space-y-2">
          {result.dimensions ? (
            <>
              <p className="font-medium">検出結果</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-neutral-700">
                <dt>長さ</dt>
                <dd>{result.dimensions.length_mm.toLocaleString()} mm</dd>
                <dt>幅</dt>
                <dd>{result.dimensions.width_mm.toLocaleString()} mm</dd>
                <dt>高さ</dt>
                <dd>{result.dimensions.height_mm.toLocaleString()} mm</dd>
                {result.volume_m3 != null && (
                  <>
                    <dt>体積</dt>
                    <dd>{result.volume_m3} m&sup3;</dd>
                  </>
                )}
                <dt>サイズクラス</dt>
                <dd className="font-semibold">{result.size_class}</dd>
              </dl>

              {result.parsed?.maker && (
                <p className="text-neutral-500">
                  車名: {result.parsed.maker}
                  {result.parsed.model ? ` / 型式: ${result.parsed.model}` : ""}
                </p>
              )}

              {result.master_size_class &&
                result.master_size_class !== result.size_class && (
                  <p className="text-amber-600 text-xs">
                    ※ マスタ判定: {result.master_size_class}（寸法判定と異なります）
                  </p>
                )}

              <div className="pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApply}
                >
                  適用
                </Button>
              </div>
            </>
          ) : (
            <p className="text-neutral-500">
              寸法を読み取れませんでした。画像を確認して再度お試しください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
