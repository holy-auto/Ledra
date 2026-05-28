"use client";

/**
 * 公開カルテ入力ページ.
 *
 * フロー:
 *   1. ?t=<rawToken> を URL から取得
 *   2. GET /api/intake/:short_id でステータス取得
 *      → pending: フォーム表示 / completed: 完了画面 / それ以外: エラー
 *   3. ユーザは身分証 OCR (任意) でフォーム自動入力
 *   4. POST /api/intake/:short_id/submit で送信
 */
import { useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";

interface StatusResponse {
  ok: true;
  label: string | null;
  status: "pending" | "completed" | "revoked" | "expired";
  expires_at: string;
  can_ocr: boolean;
  ocr_attempts_remaining: number;
}

interface OcrFields {
  name?: string;
  name_kana?: string;
  birth_date?: string;
  postal_code?: string;
  address?: string;
}

interface OcrResponse {
  ok: true;
  status: "ok" | "rejected";
  doc_type: string;
  confidence: number;
  fields: OcrFields;
  rejected_reasons: string[];
  warnings: string[];
  notice?: string;
}

const DOC_TYPE_OPTIONS = [
  { value: "driver_license", label: "運転免許証" },
  { value: "mynumber_card_front", label: "マイナンバーカード(顔写真面のみ)" },
  { value: "residence_card", label: "在留カード" },
  { value: "passport", label: "パスポート" },
  { value: "health_insurance_card", label: "健康保険証" },
] as const;
type DocType = (typeof DOC_TYPE_OPTIONS)[number]["value"];

const emptyForm = {
  name: "",
  name_kana: "",
  email: "",
  phone: "",
  postal_code: "",
  address: "",
  birth_date: "",
  note: "",
};

export default function IntakeClient({ shortId }: { shortId: string }) {
  const sp = useSearchParams();
  const rawToken = sp?.get("t") ?? "";

  const [statusState, setStatusState] = useState<
    { kind: "loading" } | { kind: "ok"; data: StatusResponse } | { kind: "error"; message: string }
  >({ kind: "loading" });

  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // OCR state
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrDocType, setOcrDocType] = useState<DocType>("driver_license");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrErr, setOcrErr] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResponse | null>(null);

  useEffect(() => {
    if (!rawToken) {
      setStatusState({ kind: "error", message: "URL が不正です (token がありません)" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/intake/${shortId}?t=${encodeURIComponent(rawToken)}`);
        const j = await res.json();
        if (!res.ok || !j?.ok) {
          setStatusState({ kind: "error", message: j?.error?.message ?? j?.message ?? "招待が見つかりません" });
          return;
        }
        setStatusState({ kind: "ok", data: j });
      } catch (e) {
        setStatusState({ kind: "error", message: e instanceof Error ? e.message : "通信エラー" });
      }
    })();
  }, [shortId, rawToken]);

  async function runOcr() {
    if (!ocrFile) return;
    setOcrBusy(true);
    setOcrErr(null);
    setOcrResult(null);
    try {
      const fd = new FormData();
      fd.append("image", ocrFile);
      fd.append("expected", ocrDocType);
      const res = await fetch(`/api/intake/${shortId}/ocr?t=${encodeURIComponent(rawToken)}`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as
        | OcrResponse
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !j || !("ok" in j) || j.ok === false) {
        const msg = (j && "error" in j && j.error?.message) || `OCR に失敗しました (HTTP ${res.status})`;
        setOcrErr(msg as string);
        return;
      }
      setOcrResult(j as OcrResponse);
    } catch (e) {
      setOcrErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setOcrBusy(false);
    }
  }

  function applyOcr() {
    if (!ocrResult || ocrResult.status !== "ok") return;
    const f = ocrResult.fields;
    setForm((prev) => ({
      ...prev,
      name: f.name ?? prev.name,
      name_kana: f.name_kana ?? prev.name_kana,
      birth_date: f.birth_date ?? prev.birth_date,
      postal_code: f.postal_code ?? prev.postal_code,
      address: f.address ?? prev.address,
    }));
    setOcrOpen(false);
    setOcrFile(null);
    setOcrResult(null);
  }

  async function submit() {
    if (!form.name.trim()) {
      setSubmitErr("お名前は必須です");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const body: Record<string, string | undefined> = {
        name: form.name.trim(),
      };
      if (form.name_kana.trim()) body.name_kana = form.name_kana.trim();
      if (form.email.trim()) body.email = form.email.trim();
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.postal_code.trim()) body.postal_code = form.postal_code.trim();
      if (form.address.trim()) body.address = form.address.trim();
      if (form.birth_date.trim()) body.birth_date = form.birth_date.trim();
      if (form.note.trim()) body.note = form.note.trim();

      const res = await fetch(`/api/intake/${shortId}/submit?t=${encodeURIComponent(rawToken)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setSubmitErr(j?.error?.message ?? j?.message ?? `送信に失敗しました (HTTP ${res.status})`);
        return;
      }
      setDone(true);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setSubmitting(false);
    }
  }

  // ──────────────── render ────────────────
  if (statusState.kind === "loading") {
    return <div className="p-6 text-sm text-muted">読み込み中…</div>;
  }

  if (statusState.kind === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-bold text-primary">エラー</h1>
        <p className="mt-2 text-sm text-danger-text">{statusState.message}</p>
      </main>
    );
  }

  if (done || statusState.data.status === "completed") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-bold text-primary">送信完了</h1>
        <p className="mt-2 text-sm text-secondary">情報を受け取りました。ご来店をお待ちしております。</p>
      </main>
    );
  }

  if (statusState.data.status !== "pending") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-bold text-primary">この招待は利用できません</h1>
        <p className="mt-2 text-sm text-danger-text">
          {statusState.data.status === "expired" ? "招待の期限が切れています。" : "招待が無効化されています。"}
          {" 店舗に新しい URL の発行を依頼してください。"}
        </p>
      </main>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <main className="mx-auto max-w-lg p-6 font-sans space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary">事前カルテのご入力</h1>
        {statusState.data.label && <p className="mt-1 text-sm text-muted">{statusState.data.label}</p>}
        <p className="mt-2 text-xs text-muted">ご記入いただいた情報は来店時の確認・施工準備にのみ使用します。</p>
      </div>

      {statusState.data.can_ocr && (
        <button
          type="button"
          onClick={() => setOcrOpen((v) => !v)}
          className="w-full rounded-xl border border-border-default bg-surface-hover px-3 py-2.5 text-sm text-primary"
        >
          {ocrOpen ? "OCR を閉じる" : "📷 身分証で自動入力 (任意)"}
        </button>
      )}

      {ocrOpen && (
        <section className="rounded-2xl border border-border-default bg-surface p-4 space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            <strong className="text-primary">本人確認ではありません。</strong>
            撮影した身分証から、氏名・住所・生年月日を自動入力する任意の機能です。 画像は保存されません。
          </p>
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950 dark:text-amber-300">
            マイナンバーカードは <strong>顔写真面のみ</strong> を撮影してください。 個人番号(裏面)
            が含まれていた場合は処理を中止します。
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">書類タイプ</label>
            <select
              value={ocrDocType}
              onChange={(e) => setOcrDocType(e.target.value as DocType)}
              className={inputCls}
              disabled={ocrBusy}
            >
              {DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">画像 (8 MB まで)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={ocrBusy}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0] ?? null;
                setOcrErr(null);
                setOcrResult(null);
                setOcrFile(f);
              }}
              className="block w-full text-sm"
            />
          </div>

          <button
            type="button"
            disabled={!ocrFile || ocrBusy}
            onClick={runOcr}
            className="rounded-xl bg-primary px-3 py-2 text-sm text-on-primary disabled:opacity-50"
          >
            {ocrBusy ? "読取り中…" : "OCR を実行"}
          </button>

          {ocrErr && (
            <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
              {ocrErr}
            </div>
          )}

          {ocrResult && ocrResult.status === "rejected" && (
            <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
              <strong>処理を中止しました</strong>
              <p className="mt-1 text-xs">{ocrResult.notice}</p>
            </div>
          )}

          {ocrResult && ocrResult.status === "ok" && (
            <div className="space-y-2 rounded-xl border border-border-default bg-surface-hover px-3 py-3 text-sm">
              <div className="flex justify-between">
                <strong className="text-primary">読取り結果</strong>
                <span className="text-xs text-muted">信頼度 {Math.round(ocrResult.confidence * 100)}%</span>
              </div>
              <Row label="氏名" v={ocrResult.fields.name} />
              <Row label="フリガナ" v={ocrResult.fields.name_kana} />
              <Row label="生年月日" v={ocrResult.fields.birth_date} />
              <Row label="郵便番号" v={ocrResult.fields.postal_code} />
              <Row label="住所" v={ocrResult.fields.address} />
              <button
                type="button"
                onClick={applyOcr}
                className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-sm text-on-primary"
              >
                フォームに反映
              </button>
            </div>
          )}
        </section>
      )}

      {/* フォーム */}
      <section className="space-y-3">
        <Field
          label="お名前"
          required
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="山田 太郎"
        />
        <Field
          label="フリガナ"
          value={form.name_kana}
          onChange={(v) => setForm({ ...form, name_kana: v })}
          placeholder="ヤマダ タロウ"
        />
        <Field
          label="生年月日"
          value={form.birth_date}
          onChange={(v) => setForm({ ...form, birth_date: v })}
          placeholder="YYYY-MM-DD"
          inputMode="numeric"
        />
        <Field
          label="郵便番号"
          value={form.postal_code}
          onChange={(v) => setForm({ ...form, postal_code: v })}
          placeholder="123-4567"
          inputMode="numeric"
        />
        <Field
          label="住所"
          value={form.address}
          onChange={(v) => setForm({ ...form, address: v })}
          placeholder="東京都渋谷区..."
        />
        <Field
          label="電話番号"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          placeholder="090-1234-5678"
          inputMode="tel"
        />
        <Field
          label="メール"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          placeholder="example@email.com"
          inputMode="email"
        />

        <div className="space-y-1">
          <label className="text-xs text-muted">ご要望・備考</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputCls}
            rows={3}
          />
        </div>
      </section>

      {submitErr && (
        <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {submitErr}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || !form.name.trim()}
        onClick={submit}
        className="w-full rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-on-primary disabled:opacity-50"
      >
        {submitting ? "送信中…" : "送信する"}
      </button>

      <p className="text-xs text-muted">
        ※ マイナンバー (12 桁の個人番号) は当サービスでは取り扱いません。入力された場合は送信が拒否されます。
      </p>
    </main>
  );
}

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "tel" | "email";
}) {
  const cls =
    "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30";
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  );
}

function Row({ label, v }: { label: string; v?: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-2 border-b border-border-default/40 py-1 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-primary">{v ?? <em className="text-muted">未取得</em>}</span>
    </div>
  );
}
