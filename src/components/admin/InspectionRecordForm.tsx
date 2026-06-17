"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { parseJsonSafe } from "@/lib/api/safeJson";
import {
  INSPECTION_TYPES,
  INSPECTION_TYPE_LABEL,
  type InspectionItemType,
  type InspectionType,
} from "@/lib/validations/inspection";

/**
 * InspectionRecordForm
 * ------------------------------------------------------------
 * 点検記録を 1 件入力するための再利用コンポーネント。
 *
 *  1. マウント時にテンプレートを取得し、項目を描画
 *  2. 項目タイプ別 UI:
 *     - ok_ng  : ○ / × / △ トグルボタン
 *     - text   : テキスト入力
 *     - numeric: 数値入力
 *     各項目に任意の「備考」テキストを付与可能
 *  3. 「写真を追加」: file input (image/*, multiple) — data URL プレビュー
 *     (Supabase Storage への実アップロードは本機能の対象外。data URL を
 *      photo_urls にそのまま保存する)
 *  4. 「点検を保存」: POST /api/admin/inspection-records
 */

type TemplateItem = { id: string; label: string; type: InspectionItemType };
type Template = { id: string; name: string; items: TemplateItem[] };
type TemplateResponse = { templates: Template[] };

type AnswerValue = { value: string; note: string };

interface Props {
  templateId: string;
  reservationId?: string;
  vehicleId?: string;
  customerId?: string;
  /** 既定の点検種別 (省略時 intake)。 */
  defaultType?: InspectionType;
  onSaved: (record: unknown) => void;
  onCancel?: () => void;
}

const OK_NG_OPTIONS: { value: string; label: string; tone: string }[] = [
  { value: "ok", label: "○", tone: "text-success-text border-success" },
  { value: "ng", label: "×", tone: "text-danger-text border-danger" },
  { value: "na", label: "△", tone: "text-warning-text border-warning" },
];

// data URL のおおよそのバイト数 (base64 部分長 * 3/4)。1 枚 4MB 程度を上限の目安とする。
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export default function InspectionRecordForm({
  templateId,
  reservationId,
  vehicleId,
  customerId,
  defaultType = "intake",
  onSaved,
  onCancel,
}: Props) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inspectionType, setInspectionType] = useState<InspectionType>(defaultType);
  const [inspectorName, setInspectorName] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // テンプレートをマウント時に取得 (一覧から該当 ID を抽出)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/admin/inspection-templates");
        const j = await parseJsonSafe<TemplateResponse & { message?: string }>(res);
        if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
        const found = (j?.templates ?? []).find((t) => t.id === templateId) ?? null;
        if (cancelled) return;
        if (!found) {
          setLoadError("点検テンプレートが見つかりませんでした。");
        } else {
          setTemplate({ ...found, items: Array.isArray(found.items) ? found.items : [] });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "テンプレートの取得に失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const items = useMemo(() => template?.items ?? [], [template]);

  const setAnswerValue = (itemId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { value, note: prev[itemId]?.note ?? "" } }));
  };
  const setAnswerNote = (itemId: string, note: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { value: prev[itemId]?.value ?? "", note } }));
  };

  const handlePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError(null);
    const next: string[] = [];
    for (const file of Array.from(files)) {
      if (photos.length + next.length >= 20) break;
      if (file.size > MAX_PHOTO_BYTES) {
        setFormError("4MB を超える画像はスキップしました。");
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        next.push(dataUrl);
      } catch {
        setFormError("画像の読み込みに失敗しました。");
      }
    }
    if (next.length > 0) setPhotos((prev) => [...prev, ...next].slice(0, 20));
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      // answers は { [item_id]: { value, note? } } の形に整形 (空のものは送らない)。
      const payloadAnswers: Record<string, { value: string; note?: string }> = {};
      for (const [itemId, a] of Object.entries(answers)) {
        const value = (a.value ?? "").trim();
        const note = (a.note ?? "").trim();
        if (!value && !note) continue;
        payloadAnswers[itemId] = { value, ...(note ? { note } : {}) };
      }

      const res = await fetch("/api/admin/inspection-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          reservation_id: reservationId || null,
          vehicle_id: vehicleId || null,
          customer_id: customerId || null,
          inspection_type: inspectionType,
          answers: payloadAnswers,
          photo_urls: photos,
          inspector_name: inspectorName.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await parseJsonSafe<{ record?: unknown; message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      onSaved(j?.record ?? null);
    } catch (e) {
      setFormError("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="glass-card p-6 text-sm text-muted">テンプレートを読み込み中…</div>;
  }
  if (loadError) {
    return <div className="glass-card border-l-4 border-danger p-4 text-sm text-danger-text">{loadError}</div>;
  }

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">点検入力</div>
          <div className="mt-0.5 truncate text-base font-semibold text-primary">{template?.name}</div>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-muted hover:text-primary" aria-label="閉じる">
            ✕
          </button>
        )}
      </div>

      {formError && (
        <div className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger-text">{formError}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-secondary">点検種別</span>
          <select
            value={inspectionType}
            onChange={(e) => setInspectionType(e.target.value as InspectionType)}
            className="input-field w-full"
          >
            {INSPECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {INSPECTION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-secondary">点検担当者</span>
          <input
            value={inspectorName}
            onChange={(e) => setInspectorName(e.target.value)}
            placeholder="担当者名"
            className="input-field w-full"
            maxLength={80}
          />
        </label>
      </div>

      {/* 点検項目 */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-hover p-4 text-center text-sm text-muted">
          このテンプレートには点検項目がありません。
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const ans = answers[item.id] ?? { value: "", note: "" };
            return (
              <li key={item.id} className="rounded-lg border border-border-subtle p-3">
                <div className="text-sm font-medium text-primary">{item.label}</div>
                <div className="mt-2">
                  {item.type === "ok_ng" && (
                    <div className="flex gap-2">
                      {OK_NG_OPTIONS.map((opt) => {
                        const active = ans.value === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAnswerValue(item.id, active ? "" : opt.value)}
                            className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold transition-colors ${
                              active
                                ? `${opt.tone} bg-surface-hover`
                                : "border-border-default text-secondary hover:bg-surface-hover"
                            }`}
                            aria-pressed={active}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {item.type === "text" && (
                    <input
                      value={ans.value}
                      onChange={(e) => setAnswerValue(item.id, e.target.value)}
                      placeholder="内容を入力"
                      className="input-field w-full"
                      maxLength={2000}
                    />
                  )}
                  {item.type === "numeric" && (
                    <input
                      type="number"
                      value={ans.value}
                      onChange={(e) => setAnswerValue(item.id, e.target.value)}
                      placeholder="数値を入力"
                      className="input-field w-40"
                    />
                  )}
                </div>
                <input
                  value={ans.note}
                  onChange={(e) => setAnswerNote(item.id, e.target.value)}
                  placeholder="備考（任意）"
                  className="input-field mt-2 w-full text-[13px]"
                  maxLength={1000}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* 外観写真 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-secondary">外観写真 ({photos.length}/20)</span>
          <label className="btn-secondary cursor-pointer text-xs">
            写真を追加
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handlePhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.map((src, idx) => (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border-subtle"
              >
                {/* data URL のプレビュー。next/image の最適化は不要なので unoptimized。 */}
                <Image src={src} alt={`点検写真 ${idx + 1}`} fill sizes="120px" unoptimized className="object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="写真を削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-secondary">特記事項</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="全体の所見・特記事項"
          className="input-field min-h-[60px] w-full"
          maxLength={2000}
        />
      </label>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost text-sm">
            キャンセル
          </button>
        )}
        <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
          {submitting ? "保存中…" : "点検を保存"}
        </button>
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}
