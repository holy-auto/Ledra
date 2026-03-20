"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Button from "@/components/ui/Button";

export default function AdminVehicleEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plateDisplay, setPlateDisplay] = useState("");
  const [vinCode, setVinCode] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/vehicles/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.vehicle) {
          const v = j.vehicle;
          setMaker(v.maker ?? "");
          setModel(v.model ?? "");
          setYear(v.year ? String(v.year) : "");
          setPlateDisplay(v.plate_display ?? "");
          setVinCode(v.vin_code ?? "");
          setNotes(v.notes ?? "");
        } else {
          setErr("車両が見つかりません。");
        }
      })
      .catch(() => setErr("データ取得に失敗しました。"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maker,
          model,
          year: year ? Number(year) : null,
          plate_display: plateDisplay || null,
          vin_code: vinCode || null,
          notes: notes || null,
        }),
      });

      const j = await res.json();

      if (!res.ok) {
        setErr(j?.message || "保存に失敗しました。");
        return;
      }

      router.push(`/admin/vehicles/${id}?saved=1`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onOcrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vehicles/parse-shakken", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setErr(j?.message || "車検証の読み取りに失敗しました。");
        return;
      }
      const x = j.extracted;
      if (x.maker) setMaker(x.maker);
      if (x.model) setModel(x.model);
      if (x.year) setYear(String(x.year));
      if (x.vin_code) setVinCode(x.vin_code);
      if (x.plate_display) setPlateDisplay(x.plate_display);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setOcrBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-muted">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">車両を編集</h1>
          <p className="text-sm text-muted">車両情報を更新します。</p>
        </div>

        {/* 車検証 OCR */}
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">車検証から自動入力</div>
          <p className="text-sm text-secondary mb-3">
            車検証を撮影 / アップロードするとメーカー・車種・年式・車体番号・ナンバーを自動入力します。
          </p>
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onOcrFileChange}
          />
          <Button
            type="button"
            variant="secondary"
            loading={ocrBusy}
            onClick={() => ocrInputRef.current?.click()}
          >
            {ocrBusy ? "読み取り中..." : "車検証から読み取る"}
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 glass-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">メーカー *</div>
              <input
                value={maker}
                onChange={(e) => setMaker(e.target.value)}
                className="input-field w-full"
                required
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">車種 *</div>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="input-field w-full"
                required
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">年式</div>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="input-field w-full"
                inputMode="numeric"
                placeholder="例: 2022"
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">ナンバー表示</div>
              <input
                value={plateDisplay}
                onChange={(e) => setPlateDisplay(e.target.value)}
                className="input-field w-full"
                placeholder="水戸 300 あ 12-34"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium text-primary">車体番号（VINコード）</div>
              <input
                value={vinCode}
                onChange={(e) => setVinCode(e.target.value)}
                className="input-field w-full font-mono"
                placeholder="例: JF1GP7LD7EG000001"
                maxLength={50}
              />
            </label>
          </div>

          <label className="space-y-2 block">
            <div className="text-sm font-medium text-primary">メモ</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field min-h-[120px] w-full"
            />
          </label>

          {err ? (
            <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
              {err}
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button type="submit" loading={busy}>
              保存する
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/admin/vehicles/${id}`)}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
