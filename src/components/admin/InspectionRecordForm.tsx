"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { parseJsonSafe } from "@/lib/api/safeJson";
import VoiceMemoPanel from "@/app/admin/certificates/new/VoiceMemoPanel";
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
 *  3. 「カメラで撮影 / アルバムから選択」: 選択した写真はローカル保持し、
 *     「保存」確定時にまとめて Supabase Storage (`/api/admin/inspection-records/images`)
 *     へアップロードして公開 URL を photo_urls に保存する。所見は音声メモ (VoiceMemoPanel)
 *     からも入力できる (AI 対応プランのみ)。
 *  4. 「点検を保存」: 写真アップロード → POST /api/admin/inspection-records
 */

type TemplateItem = { id: string; label: string; type: InspectionItemType };
type Template = { id: string; name: string; items: TemplateItem[] };
type TemplateResponse = { templates: Template[] };

/** 呼び出し元が取得済みのテンプレートを渡すための緩い形 (再取得を省く)。 */
type ProvidedTemplate = { id: string; name: string; items: Array<{ id: string; label: string; type: string }> };

function normalizeTemplate(t: ProvidedTemplate): Template {
  return {
    id: t.id,
    name: t.name,
    items: (Array.isArray(t.items) ? t.items : []).map((it) => ({
      id: it.id,
      label: it.label,
      type: it.type as InspectionItemType,
    })),
  };
}

type AnswerValue = { value: string; note: string };

interface Props {
  templateId: string;
  /** 呼び出し元が既に取得済みのテンプレート。渡すとマウント時の再取得を省略する。 */
  template?: ProvidedTemplate;
  reservationId?: string;
  vehicleId?: string;
  customerId?: string;
  /** 既定の点検種別 (省略時 intake)。 */
  defaultType?: InspectionType;
  /** 音声メモ(AI整形)を使えるプランか。false のときパネルを出さない (既定 true)。 */
  canUseVoiceAi?: boolean;
  onSaved: (record: unknown) => void;
  onCancel?: () => void;
}

/** ローカル保持する写真 1 枚 (保存確定時にまとめてアップロードする)。 */
type LocalPhoto = { file: File; preview: string };

const OK_NG_OPTIONS: { value: string; label: string; tone: string }[] = [
  { value: "ok", label: "○", tone: "text-success-text border-success" },
  { value: "ng", label: "×", tone: "text-danger-text border-danger" },
  { value: "na", label: "△", tone: "text-warning-text border-warning" },
];

const MAX_PHOTOS = 20;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15MB / 枚 (サーバ側と一致)

export default function InspectionRecordForm({
  templateId,
  template: providedTemplate,
  reservationId,
  vehicleId,
  customerId,
  defaultType = "intake",
  canUseVoiceAi = true,
  onSaved,
  onCancel,
}: Props) {
  const [template, setTemplate] = useState<Template | null>(
    providedTemplate ? normalizeTemplate(providedTemplate) : null,
  );
  const [loading, setLoading] = useState(!providedTemplate);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inspectionType, setInspectionType] = useState<InspectionType>(defaultType);
  const [inspectorName, setInspectorName] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // テンプレートをマウント時に取得 (一覧から該当 ID を抽出)。
  // 呼び出し元が template を渡していれば再取得しない。
  useEffect(() => {
    if (providedTemplate) return;
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
  }, [templateId, providedTemplate]);

  const items = useMemo(() => template?.items ?? [], [template]);

  const setAnswerValue = (itemId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { value, note: prev[itemId]?.note ?? "" } }));
  };
  const setAnswerNote = (itemId: string, note: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { value: prev[itemId]?.value ?? "", note } }));
  };

  // 選択した写真はローカルに保持し、実アップロードは「保存」確定時にまとめて行う。
  // こうすることで、プレビュー削除やキャンセルで Storage に孤児が残らず、
  // アップロード完了前に保存されて写真が抜け落ちる競合も起きない。
  const handlePhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const next: LocalPhoto[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > MAX_PHOTO_BYTES) {
        setFormError(`${MAX_PHOTO_BYTES / 1024 / 1024}MB を超える画像はスキップしました。`);
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    if (next.length > 0) setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // アンマウント時に、未確定プレビューの objectURL をまとめて解放する
  // (最新の photos を参照するため ref 経由。依存を [] にして解放は unmount 時のみ)。
  const photosRef = useRef<LocalPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, []);

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      // 1) 写真があれば先に Storage へアップロードして URL を得る（保存確定時に一括）。
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        const form = new FormData();
        photos.forEach((p) => form.append("photos", p.file));
        const upRes = await fetch("/api/admin/inspection-records/images", { method: "POST", body: form });
        const upJson = await parseJsonSafe<{ urls?: string[]; message?: string }>(upRes);
        if (!upRes.ok) throw new Error(upJson?.message ?? `写真アップロード失敗 (HTTP ${upRes.status})`);
        photoUrls = upJson?.urls ?? [];
      }

      // 2) answers は { [item_id]: { value, note? } } の形に整形 (空のものは送らない)。
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
          photo_urls: photoUrls,
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

      {/* 外観写真 — カメラ直行 (撮影) とアルバム選択の 2 入力。証明書フォームの
          PhotoUploadSection と同じ使い分け。実アップロードは保存確定時にまとめて行う。 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-secondary">
            外観写真 ({photos.length}/{MAX_PHOTOS})
          </span>
          <div className="flex gap-2">
            <label
              className={`btn-secondary cursor-pointer text-xs ${
                submitting || photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-50" : ""
              }`}
            >
              カメラで撮影
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                disabled={submitting || photos.length >= MAX_PHOTOS}
                onChange={(e) => {
                  handlePhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label
              className={`btn-secondary cursor-pointer text-xs ${
                submitting || photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-50" : ""
              }`}
            >
              アルバムから選択
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={submitting || photos.length >= MAX_PHOTOS}
                onChange={(e) => {
                  handlePhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.map((p, idx) => (
              <div
                key={p.preview}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border-subtle"
              >
                {/* ローカル objectURL のプレビュー。保存時に実アップロードするため unoptimized。 */}
                <Image
                  src={p.preview}
                  alt={`点検写真 ${idx + 1}`}
                  fill
                  sizes="120px"
                  unoptimized
                  className="object-cover"
                />
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

      <div className="space-y-2">
        <span className="text-[12px] font-medium text-secondary">特記事項</span>
        {/* 音声で所見を話すだけ → AI 整形して特記事項に流し込む。証明書フォームと同じ VoiceMemoPanel を
            note バリアントで再利用。Web Speech 非対応環境では手打ちにフォールバックする。
            AI 下書きを使えないプラン (Free) では API が 403 になるため、パネル自体を出さない。 */}
        {canUseVoiceAi && (
          <VoiceMemoPanel
            variant="note"
            serviceType="inspection"
            onApply={(note) => setNotes((prev) => (prev ? `${prev}\n${note}` : note))}
          />
        )}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="全体の所見・特記事項"
          className="input-field min-h-[60px] w-full"
          maxLength={2000}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            キャンセル
          </button>
        )}
        <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
          {submitting ? (photos.length > 0 ? "アップロード中…" : "保存中…") : "点検を保存"}
        </button>
      </div>
    </div>
  );
}
