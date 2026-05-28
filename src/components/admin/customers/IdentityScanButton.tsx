"use client";

/**
 * IdentityScanButton — 身分証 OCR で顧客フォームを自動入力するボタン.
 *
 * フロー:
 *   1. ボタン押下 → Modal 表示
 *   2. 書類タイプ選択 + ファイル選択 (camera capture 可)
 *   3. POST /api/identity/ocr で AI Vision OCR
 *   4. 抽出フィールドを preview し、ユーザが「適用」を押すと
 *      onComplete に渡してフォームへ反映 (上書き or マージはオプション)
 *
 * 注意:
 *   - これは本人確認ではない. UI 上も「自動入力」と明記する.
 *   - マイナンバー検知時は status="rejected" で全フィールド破棄される.
 *   - 画像はサーバに送るが、サーバ側で永続化していない (route 仕様).
 */
import { useState, type ChangeEvent } from "react";
import Modal from "@/components/ui/Modal";

const DOC_TYPE_OPTIONS = [
  { value: "driver_license", label: "運転免許証" },
  { value: "mynumber_card_front", label: "マイナンバーカード (顔写真面のみ)" },
  { value: "residence_card", label: "在留カード" },
  { value: "passport", label: "パスポート" },
  { value: "health_insurance_card", label: "健康保険証" },
] as const;

type DocType = (typeof DOC_TYPE_OPTIONS)[number]["value"];

export interface IdentityScanFields {
  name?: string;
  name_kana?: string;
  birth_date?: string;
  postal_code?: string;
  address?: string;
  gender?: "male" | "female" | "other";
  expiration_date?: string;
}

interface ApiOk {
  ok: true;
  status: "ok" | "rejected";
  doc_type: string;
  confidence: number;
  fields: IdentityScanFields;
  rejected_reasons: string[];
  warnings: string[];
  notice?: string;
}

interface ApiErr {
  ok: false;
  error?: { message?: string };
  message?: string;
}

interface Props {
  /** OCR 完了時にフォームへ渡すコールバック. 空フィールドは省略済み. */
  onComplete: (fields: IdentityScanFields) => void;
  /** 表示テキスト. デフォルト「身分証で自動入力」. */
  label?: string;
  /** ボタンのクラス. デフォルト btn-secondary 相当. */
  className?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

export default function IdentityScanButton({ onComplete, label = "身分証で自動入力", className = "btn-ghost" }: Props) {
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<DocType>("driver_license");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiOk | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setBusy(false);
    setResult(null);
    setErrorMsg(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setErrorMsg(null);
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrorMsg(`ファイルサイズが ${MAX_BYTES / 1024 / 1024} MB を超えています`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function runOcr() {
    if (!file) return;
    setBusy(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("expected", docType);

      const res = await fetch("/api/identity/ocr", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as ApiOk | ApiErr | null;

      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        const msg =
          (json && "error" in json && json.error?.message) ||
          (json && "message" in json && json.message) ||
          `OCR に失敗しました (HTTP ${res.status})`;
        setErrorMsg(msg);
        return;
      }
      setResult(json);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  function applyFields() {
    if (!result || result.status !== "ok") return;
    onComplete(result.fields);
    close();
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      <Modal
        open={open}
        onClose={close}
        title="身分証で自動入力"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
              閉じる
            </button>
            {result && result.status === "ok" ? (
              <button type="button" className="btn-primary" onClick={applyFields}>
                フォームに反映
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={runOcr} disabled={!file || busy}>
                {busy ? "読取り中…" : "OCR を実行"}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            撮影/選択した身分証から、氏名・生年月日・住所を自動入力します。
            <strong className="text-primary"> 本人確認ではありません</strong>。 内容は必ずご確認ください。
            <br />
            画像はサーバ上で OCR 処理のみに使用され、保存されません。
          </p>

          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950 dark:text-amber-300">
            <strong>マイナンバーカードの場合は顔写真面のみ</strong>を撮影してください。
            個人番号(裏面)が含まれていた場合は処理を中止します。
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">書類タイプ</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
              className="input-field"
              disabled={busy}
            >
              {DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">画像 (JPEG / PNG / WebP, 8MB まで)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={onFileChange}
              disabled={busy}
              className="block w-full text-sm text-primary file:mr-3 file:rounded-lg file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
            />
            {file && (
              <p className="text-xs text-muted">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
              {errorMsg}
            </div>
          )}

          {result && result.status === "rejected" && (
            <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
              <strong>処理を中止しました</strong>
              <p className="mt-1 text-xs">{result.notice ?? "結果を破棄しました。手動で入力してください。"}</p>
              {result.rejected_reasons.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {result.rejected_reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && result.status === "ok" && (
            <div className="space-y-2 rounded-xl border border-border-default bg-surface px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <strong className="text-primary">読取り結果</strong>
                <span className="text-xs text-muted">信頼度 {Math.round(result.confidence * 100)}%</span>
              </div>
              <FieldRow label="氏名" value={result.fields.name} />
              <FieldRow label="フリガナ" value={result.fields.name_kana} />
              <FieldRow label="生年月日" value={result.fields.birth_date} />
              <FieldRow label="郵便番号" value={result.fields.postal_code} />
              <FieldRow label="住所" value={result.fields.address} />
              <FieldRow label="性別" value={genderLabel(result.fields.gender)} />
              <FieldRow label="有効期限" value={result.fields.expiration_date} />
              {result.warnings.length > 0 && (
                <div className="mt-2 rounded-lg bg-warning-bg px-2 py-1.5 text-xs text-warning-text">
                  {result.warnings.join(" / ")}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">
                「フォームに反映」を押すと、上記の値が入力欄に転記されます。送信前に必ず内容を確認してください。
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function FieldRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-2 border-b border-border-default/50 py-1 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-primary">{value ?? <em className="text-muted">未取得</em>}</span>
    </div>
  );
}

function genderLabel(g?: "male" | "female" | "other"): string | undefined {
  if (!g) return undefined;
  return g === "male" ? "男性" : g === "female" ? "女性" : "その他";
}
