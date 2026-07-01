"use client";

/**
 * 現場タブレットの部品装着記録フロー。
 *
 * 1) 部品情報を入力
 * 2) 写真を撮影/選択 → POST /api/parts/installations/evidence-upload でステージ
 *    (サーバが sha256/知覚ハッシュ/EXIF/改ざん疑い flag を算出して返す)
 * 3) 送信 → POST /api/parts/installations に部品情報 + ステージ済み evidence[] を渡す
 *    (content_hash に写真が取り込まれる)。結果 (findings) を表示。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const PART_KINDS = [
  { value: "consumable", label: "消耗品" },
  { value: "serialized", label: "シリアル管理" },
  { value: "lot_only", label: "ロット管理" },
  { value: "high_value", label: "高額品" },
] as const;

const PHOTO_KINDS = [
  { value: "install_photo", label: "装着後" },
  { value: "context_photo", label: "全体/文脈" },
  { value: "old_part_photo", label: "旧品" },
  { value: "removed_part", label: "取外し品" },
  { value: "seal", label: "封印" },
  { value: "marking", label: "刻印" },
] as const;
type PhotoKind = (typeof PHOTO_KINDS)[number]["value"];

const GRADE_LABEL: Record<string, string> = {
  basic: "EXIF あり",
  unverified: "EXIF なし",
};

interface StagedPhoto {
  localId: string;
  kind: PhotoKind;
  preview: string;
  uploading: boolean;
  error: string | null;
  // ステージ結果 (作成 API の evidence[] に渡す)
  storage_path?: string;
  sha256?: string;
  perceptual_hash?: string;
  exif_captured_at?: string | null;
  authenticity_grade?: string;
  integrity_flags?: string[];
}

interface Option {
  id: string;
  label: string;
}

export default function PartInstallClient() {
  const [partName, setPartName] = useState("");
  const [partKind, setPartKind] = useState<(typeof PART_KINDS)[number]["value"]>("consumable");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("個");
  const [serialNo, setSerialNo] = useState("");
  const [gtin, setGtin] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [amount, setAmount] = useState("");

  const [customers, setCustomers] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [nextKind, setNextKind] = useState<PhotoKind>("install_photo");
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [result, setResult] = useState<{ id: string; findings: number } | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // 顧客・車両リスト
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/customers?per_page=200");
        if (res.ok) {
          const j = await res.json();
          const list = (j.customers ?? j.items ?? []) as Array<Record<string, unknown>>;
          setCustomers(list.map((c) => ({ id: String(c.id), label: String(c.name ?? "") })));
        }
      } catch {
        /* optional */
      }
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ per_page: "200" });
        if (customerId) params.set("customer_id", customerId);
        const res = await fetch(`/api/admin/vehicles?${params.toString()}`);
        if (res.ok) {
          const j = await res.json();
          const list = (j.vehicles ?? []) as Array<Record<string, unknown>>;
          setVehicles(
            list.map((v) => ({
              id: String(v.id),
              label: [v.maker, v.model, v.plate_display].filter(Boolean).join(" ") || String(v.id).slice(0, 8),
            })),
          );
        }
      } catch {
        /* optional */
      }
    })();
  }, [customerId]);

  // 写真を撮影/選択 → ステージ
  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const localId = `${Date.now()}-${Math.round(performance.now())}`;
    const kind = nextKind;
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, { localId, kind, preview, uploading: true, error: null }]);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("photo", file);
      const res = await fetch("/api/parts/installations/evidence-upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.message ?? j?.error ?? "アップロードに失敗しました");
      setPhotos((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? {
                ...p,
                uploading: false,
                storage_path: j.storage_path,
                sha256: j.sha256,
                perceptual_hash: j.perceptual_hash,
                exif_captured_at: j.exif_captured_at ?? null,
                authenticity_grade: j.authenticity_grade,
                integrity_flags: Array.isArray(j.integrity_flags) ? j.integrity_flags : [],
              }
            : p,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "アップロードに失敗しました";
      setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, uploading: false, error: msg } : p)));
    }
  }

  function removePhoto(localId: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.localId !== localId);
    });
  }

  const staged = photos.filter((p) => !p.uploading && !p.error && p.storage_path);
  const anyUploading = photos.some((p) => p.uploading);

  async function submit() {
    if (!partName.trim()) {
      showToast("error", "部品名を入力してください。");
      return;
    }
    if (anyUploading) {
      showToast("error", "写真のアップロード完了をお待ちください。");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const body = {
        part_name: partName.trim(),
        part_kind: partKind,
        quantity: Number(quantity) > 0 ? Number(quantity) : 1,
        unit: unit.trim() || "個",
        serial_no: serialNo.trim() || null,
        gtin: gtin.trim() || null,
        lot_code: lotCode.trim() || null,
        amount_jpy: amount ? Number(amount) : null,
        customer_id: customerId || null,
        vehicle_id: vehicleId || null,
        evidence: staged.map((p) => ({
          kind: p.kind,
          storage_path: p.storage_path,
          sha256: p.sha256,
          perceptual_hash: p.perceptual_hash,
          exif_captured_at: p.exif_captured_at ?? null,
          authenticity_grade: p.authenticity_grade,
          integrity_flags: p.integrity_flags ?? [],
        })),
      };
      const res = await fetch("/api/parts/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "登録に失敗しました");
      const id = j.installation?.id ?? j.id;
      const findings = Array.isArray(j.findings) ? j.findings.length : 0;
      setResult({ id, findings });
      showToast("success", "装着記録を登録しました。");
      // フォームをリセット (連続入力しやすく)
      setPartName("");
      setSerialNo("");
      setGtin("");
      setLotCode("");
      setAmount("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">装着記録（現場）</h1>
        <p className="mt-1 text-sm text-secondary">
          部品情報を入力し、写真を撮影して登録します。写真は撮影時にハッシュ・EXIF が付与され、証跡に取り込まれます。
        </p>
      </div>

      {result && (
        <div className="glass-card mb-4 rounded-xl border border-success/30 bg-success-dim/40 p-4 text-sm">
          <div className="font-medium text-success-text">登録しました。</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-secondary">
            {result.findings > 0 ? (
              <span className="text-danger-text">検知された懸念: {result.findings} 件</span>
            ) : (
              <span>検知された懸念: なし</span>
            )}
            <Link href={`/admin/parts-integrity/${result.id}`} className="text-accent hover:underline">
              詳細を見る →
            </Link>
          </div>
        </div>
      )}

      {/* 部品情報 */}
      <section className="glass-card mb-4 space-y-4 rounded-xl p-4">
        <Field label="部品名" required>
          <input
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            className="input-field w-full"
            placeholder="例: ドライブレコーダー"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="種別">
            <select
              value={partKind}
              onChange={(e) => setPartKind(e.target.value as typeof partKind)}
              className="input-field w-full"
            >
              {PART_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="金額（税込・任意）">
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field w-full"
              placeholder="例: 30000"
            />
          </Field>
          <Field label="数量">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-field w-full"
            />
          </Field>
          <Field label="単位">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field w-full" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="シリアル番号（任意）">
            <input
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              className="input-field w-full"
              placeholder="生値は保存されません"
            />
          </Field>
          <Field label="GTIN（任意）">
            <input value={gtin} onChange={(e) => setGtin(e.target.value)} className="input-field w-full" />
          </Field>
          <Field label="ロット番号（任意）">
            <input value={lotCode} onChange={(e) => setLotCode(e.target.value)} className="input-field w-full" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="顧客（任意）">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input-field w-full">
              <option value="">（未選択）</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="車両（任意）">
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="input-field w-full">
              <option value="">（未選択）</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* 写真 */}
      <section className="glass-card mb-4 space-y-3 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-primary">写真（{staged.length} 枚）</div>
          <div className="flex items-center gap-2">
            <select
              value={nextKind}
              onChange={(e) => setNextKind(e.target.value as PhotoKind)}
              className="input-field text-sm"
            >
              {PHOTO_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary text-sm">
              写真を追加
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />

        {photos.length === 0 ? (
          <p className="text-xs text-muted">「写真を追加」で撮影またはアップロードしてください。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <div key={p.localId} className="relative overflow-hidden rounded-lg border border-border-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="h-28 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.localId)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 px-2 text-xs text-white"
                >
                  ×
                </button>
                <div className="space-y-0.5 p-2 text-[10px]">
                  <div className="text-secondary">{PHOTO_KINDS.find((k) => k.value === p.kind)?.label}</div>
                  {p.uploading && <div className="text-muted">アップロード中…</div>}
                  {p.error && <div className="text-danger">{p.error}</div>}
                  {!p.uploading && !p.error && (
                    <>
                      <div className="text-muted">
                        {GRADE_LABEL[p.authenticity_grade ?? ""] ?? p.authenticity_grade}
                      </div>
                      {p.integrity_flags && p.integrity_flags.length > 0 && (
                        <div className="text-danger">要確認: {p.integrity_flags.join(", ")}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className="text-xs text-muted">{anyUploading ? "写真処理中…" : `写真 ${staged.length} 枚`}</span>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || anyUploading}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? "登録中…" : "装着を登録する"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-20 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
