"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LeadSource } from "@/lib/marketing/leads";
import { track } from "@/lib/marketing/analytics";

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors";

const successCardClass = "text-center py-16 px-8 rounded-xl bg-white/[0.04] border border-white/[0.07]";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

type FieldsConfig = {
  /** Require a phone field (default: false) */
  phone?: boolean;
  /** Add an industry select (default: false) */
  industry?: boolean;
  /** Add a locations select (default: false) */
  locations?: boolean;
  /** Add a timing select (default: false) */
  timing?: boolean;
  /** Message textarea: omit => no field, object => shown with options */
  message?:
    | false
    | {
        required?: boolean;
        placeholder?: string;
        label?: string;
        rows?: number;
      };
};

export type LeadFormProps = {
  /** Source tag persisted on every lead row */
  source: LeadSource;
  /** Optional finer-grained identifier (e.g. which PDF was requested) */
  resourceKey?: string;
  /** Field customization */
  fields?: FieldsConfig;
  /** Label overrides */
  labels?: {
    company?: string;
    role?: string;
    submit?: string;
    submitting?: string;
    companyPlaceholder?: string;
  };
  /** Pre-filled extra context (e.g. ROI calculator inputs & outputs) */
  context?: Record<string, unknown>;
  /** Success pane overrides */
  success?: {
    title?: string;
    body?: string;
  };
  /** Fires after the server responds OK. Receives the new lead id. */
  onSubmitted?: (leadId: string) => void;
};

export function LeadForm({
  source,
  resourceKey,
  fields = {},
  labels = {},
  context,
  success,
  onSubmitted,
}: LeadFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [referrer, setReferrer] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const collected: Record<string, string> = {};
      for (const key of UTM_KEYS) {
        const v = params.get(key);
        if (v) collected[key] = v;
      }
      setUtm(collected);
      setReferrer(document.referrer || "");
    } catch {
      // ignore
    }
  }, []);

  if (submitted) {
    return (
      <div className={successCardClass}>
        <div className="w-16 h-16 mx-auto bg-blue-500/[0.1] rounded-full flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-8 h-8 text-blue-400"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-bold text-white">{success?.title ?? "送信を受け付けました"}</h3>
        <p className="mt-3 text-white/50 leading-relaxed whitespace-pre-line">
          {success?.body ?? "ご登録いただいたメールアドレスに追ってご連絡いたします。\n通常1営業日以内にお届けします。"}
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSending(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      source,
      resource_key: resourceKey,
      name: (fd.get("name") as string | null)?.trim() || undefined,
      company: (fd.get("company") as string | null)?.trim() || undefined,
      role: (fd.get("role") as string | null)?.trim() || undefined,
      email: ((fd.get("email") as string | null) ?? "").trim(),
      phone: (fd.get("phone") as string | null)?.trim() || undefined,
      industry: (fd.get("industry") as string | null) || undefined,
      locations: (fd.get("locations") as string | null) || undefined,
      timing: (fd.get("timing") as string | null) || undefined,
      message: (fd.get("message") as string | null)?.trim() || undefined,
      context,
      consent: fd.get("consent") === "on",
      referrer: referrer || undefined,
      ...utm,
    };

    if (!payload.consent) {
      setError("プライバシーポリシーへの同意が必要です。");
      setSending(false);
      track({ name: "form_validation_failed", props: { source, reason: "no_consent" } });
      return;
    }

    try {
      const res = await fetch("/api/marketing/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch((): null => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "送信に失敗しました。");
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string };
      track({ name: "lead_submitted", props: { source, resource_key: resourceKey } });
      if (data.id) onSubmitted?.(data.id);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました。しばらくしてから再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  const companyLabel = labels.company ?? "会社名";
  const roleLabel = labels.role ?? "役職";
  const submitLabel = labels.submit ?? "送信する";
  const submittingLabel = labels.submitting ?? "送信中...";
  const showMessage = fields.message !== undefined && fields.message !== false;
  const messageConfig = showMessage && fields.message ? fields.message : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="lf-name" className="block text-sm font-medium text-white/80 mb-2">
            お名前 <span className="text-red-400">*</span>
          </label>
          <input
            id="lf-name"
            type="text"
            name="name"
            required
            className={inputClass}
            placeholder="山田 太郎"
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="lf-company" className="block text-sm font-medium text-white/80 mb-2">
            {companyLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="lf-company"
            type="text"
            name="company"
            required
            className={inputClass}
            placeholder={labels.companyPlaceholder ?? "株式会社〇〇"}
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="lf-role" className="block text-sm font-medium text-white/80 mb-2">
            {roleLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="lf-role"
            type="text"
            name="role"
            required
            className={inputClass}
            placeholder="代表 / 店長 / 担当者"
            autoComplete="organization-title"
          />
        </div>
        <div>
          <label htmlFor="lf-email" className="block text-sm font-medium text-white/80 mb-2">
            メールアドレス <span className="text-red-400">*</span>
          </label>
          <input
            id="lf-email"
            type="email"
            name="email"
            required
            className={inputClass}
            placeholder="example@company.com"
            autoComplete="email"
          />
        </div>
      </div>

      {fields.phone && (
        <div>
          <label htmlFor="lf-phone" className="block text-sm font-medium text-white/80 mb-2">
            電話番号
          </label>
          <input
            id="lf-phone"
            type="tel"
            name="phone"
            className={inputClass}
            placeholder="03-1234-5678"
            autoComplete="tel"
          />
        </div>
      )}

      {(fields.industry || fields.locations || fields.timing) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {fields.industry && (
            <div>
              <label htmlFor="lf-industry" className="block text-sm font-medium text-white/80 mb-2">
                業態
              </label>
              <select id="lf-industry" name="industry" className={inputClass}>
                <option value="">選択してください</option>
                <option value="coating">コーティング専門店</option>
                <option value="film">フィルム施工</option>
                <option value="dealer">新車・中古車販売</option>
                <option value="repair">板金・整備</option>
                <option value="detailing">デタイリング</option>
                <option value="insurer">保険会社</option>
                <option value="agent">代理店</option>
                <option value="other">その他</option>
              </select>
            </div>
          )}
          {fields.locations && (
            <div>
              <label htmlFor="lf-locations" className="block text-sm font-medium text-white/80 mb-2">
                拠点数
              </label>
              <select id="lf-locations" name="locations" className={inputClass}>
                <option value="">選択してください</option>
                <option value="1">1拠点</option>
                <option value="2-5">2〜5拠点</option>
                <option value="6-20">6〜20拠点</option>
                <option value="21+">21拠点以上</option>
              </select>
            </div>
          )}
          {fields.timing && (
            <div>
              <label htmlFor="lf-timing" className="block text-sm font-medium text-white/80 mb-2">
                検討時期
              </label>
              <select id="lf-timing" name="timing" className={inputClass}>
                <option value="">選択してください</option>
                <option value="asap">すぐに導入したい</option>
                <option value="3m">3ヶ月以内</option>
                <option value="6m">半年以内</option>
                <option value="later">情報収集中</option>
              </select>
            </div>
          )}
        </div>
      )}

      {messageConfig && (
        <div>
          <label htmlFor="lf-message" className="block text-sm font-medium text-white/80 mb-2">
            {messageConfig.label ?? "ご質問・ご要望"}
            {messageConfig.required && <span className="text-red-400"> *</span>}
          </label>
          <textarea
            id="lf-message"
            name="message"
            rows={messageConfig.rows ?? 4}
            required={messageConfig.required}
            className={`${inputClass} resize-none`}
            placeholder={messageConfig.placeholder ?? "具体的なご質問やご要望があればご記入ください"}
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        <input
          id="lf-consent"
          name="consent"
          type="checkbox"
          required
          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/[0.05] text-blue-500 focus:ring-blue-500/40"
        />
        <label htmlFor="lf-consent" className="text-xs text-white/60 leading-relaxed">
          <Link href="/privacy" className="underline text-white/80 hover:text-white">
            プライバシーポリシー
          </Link>
          に同意の上、ご入力いただいた情報がお問い合わせ対応・ご案内のために利用されることに同意します。
        </label>
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full sm:w-auto inline-flex items-center justify-center font-medium rounded-lg text-[0.938rem] px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_2px_20px_rgba(59,130,246,0.45)] hover:-translate-y-[0.5px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
