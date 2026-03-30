"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { TurnstileWidget } from "@/components/ui/TurnstileWidget";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type BusinessType = "corporation" | "sole_proprietor";

const STEP_LABELS: Record<Step, string> = {
  1: "メール確認",
  2: "コード入力",
  3: "会社情報",
  4: "利用規約",
  5: "パスワード設定",
  6: "プラン選択",
};

export default function InsurerRegisterPage() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 1: Email
  const [email, setEmail] = useState("");

  // Step 2: Code
  const [code, setCode] = useState("");

  // Step 3: Company info
  const [businessType, setBusinessType] = useState<BusinessType>("corporation");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [corporateNumber, setCorporateNumber] = useState("");
  const [address, setAddress] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  // Step 4: Terms
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [antiSocialAccepted, setAntiSocialAccepted] = useState(false);

  // Step 5: Password
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Step 6: Plan
  const [requestedPlan, setRequestedPlan] = useState("basic");

  // Final state
  const [done, setDone] = useState(false);

  // Turnstile (step 1 only)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const clearErr = () => setErr(null);

  // --- GBiz API lookup ---
  const handleLookupCorporate = useCallback(async (number: string) => {
    const cleaned = number.replace(/[-\s]/g, "");
    if (cleaned.length !== 13) return;

    setLookingUp(true);
    setLookupDone(false);
    try {
      const res = await fetch(`/api/join/lookup-corporate?number=${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        setLookupDone(true);
        return;
      }
      const json = await res.json();
      if (json.company_name) setCompanyName(json.company_name);
      if (json.address) setAddress(json.address);
      if (json.representative_name) setRepresentativeName(json.representative_name);
      setLookupDone(true);
    } catch {
      // Silently fail — user can fill in manually
      setLookupDone(true);
    } finally {
      setLookingUp(false);
    }
  }, []);

  const handleCorporateNumberChange = useCallback((value: string) => {
    setCorporateNumber(value);
    setLookupDone(false);
    const cleaned = value.replace(/[-\s]/g, "");
    if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
      handleLookupCorporate(cleaned);
    }
  }, [handleLookupCorporate]);

  // --- Step 1: Send verification code ---
  const handleSendCode = async () => {
    clearErr();
    if (!email.trim()) return setErr("メールアドレスを入力してください");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setErr("有効なメールアドレスを入力してください");
    if (step === 1 && !turnstileToken) return setErr("セキュリティ確認が完了していません");

    setBusy(true);
    try {
      const res = await fetch("/api/join/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), turnstile_token: turnstileToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "送信に失敗しました");
      setStep(2);
    } catch (e: any) {
      setErr(e?.message ?? "送信に失敗しました");
      setTurnstileToken(null);
    } finally {
      setBusy(false);
    }
  };

  // --- Step 2: Verify code ---
  const handleVerifyCode = async () => {
    clearErr();
    if (!code.trim()) return setErr("確認コードを入力してください");
    if (code.trim().length !== 6) return setErr("確認コードは6桁です");

    setBusy(true);
    try {
      const res = await fetch("/api/join/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "認証に失敗しました");
      setStep(3);
    } catch (e: any) {
      setErr(e?.message ?? "認証に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  // --- Step 3: Company info validation ---
  const handleCompanyInfo = () => {
    clearErr();
    if (!companyName.trim()) return setErr("会社名・屋号を入力してください");
    if (!contactPerson.trim()) return setErr("担当者名を入力してください");
    if (businessType === "corporation") {
      const cleaned = corporateNumber.replace(/[-\s]/g, "");
      if (!cleaned) return setErr("法人の場合、法人番号は必須です");
      if (!/^\d{13}$/.test(cleaned)) return setErr("法人番号は13桁の数字で入力してください");
    }
    setStep(4);
  };

  // --- Step 4: Terms ---
  const handleTerms = () => {
    clearErr();
    if (!termsAccepted) return setErr("利用規約への同意が必要です");
    if (!privacyAccepted) return setErr("プライバシーポリシーへの同意が必要です");
    if (!antiSocialAccepted) return setErr("反社会的勢力排除条項への同意が必要です");
    setStep(5);
  };

  // --- Step 5: Password ---
  const handlePassword = () => {
    clearErr();
    if (password.length < 8) return setErr("パスワードは8文字以上で入力してください");
    if (!/[A-Z]/.test(password)) return setErr("パスワードに大文字を1文字以上含めてください");
    if (!/[a-z]/.test(password)) return setErr("パスワードに小文字を1文字以上含めてください");
    if (!/[0-9]/.test(password)) return setErr("パスワードに数字を1文字以上含めてください");
    if (password !== passwordConfirm) return setErr("パスワードが一致しません");
    setStep(6);
  };

  // --- Step 6: Submit ---
  const handleSubmit = async () => {
    clearErr();
    setBusy(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_type: businessType,
          company_name: companyName.trim(),
          contact_person: contactPerson.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          requested_plan: requestedPlan,
          corporate_number: businessType === "corporation" ? corporateNumber.trim() : "",
          address: address.trim(),
          representative_name: representativeName.trim(),
          terms_accepted: true,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          throw new Error(json.details.join("\n"));
        }
        throw new Error(json.message ?? json.error ?? "登録に失敗しました");
      }

      // Registration success → auto-login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (loginError) {
        // Account created but auto-login failed
        setDone(true);
        return;
      }

      window.location.href = "/insurer";
    } catch (e: any) {
      setErr(e?.message ?? "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  // --- Completed view ---
  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base p-6">
        <div className="glass-card w-full max-w-lg space-y-6 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary">登録が完了しました</h1>
          <p className="text-sm text-secondary">
            審査が完了次第、ご登録のメールアドレスにご連絡いたします。
          </p>
          <a href="/insurer/login" className="btn-primary inline-block px-8">
            ログインページへ
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-lg space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">加盟店 新規登録</h1>
          <p className="text-sm text-muted mt-1">
            Step {step} / 6 — {STEP_LABELS[step]}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1">
          {([1, 2, 3, 4, 5, 6] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-accent" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>

        <div className="grid gap-4">
          {/* ───── Step 1: Email ───── */}
          {step === 1 && (
            <>
              <label>
                <div className="text-sm text-secondary mb-1">
                  メールアドレス <span className="text-red-500">*</span>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@company.co.jp"
                  className="input-field w-full"
                  onKeyDown={(e) => e.key === "Enter" && !busy && handleSendCode()}
                />
              </label>
              <p className="text-xs text-muted">
                確認コードをメールでお送りします。
              </p>
              <TurnstileWidget onTokenChange={setTurnstileToken} />
            </>
          )}

          {/* ───── Step 2: Code ───── */}
          {step === 2 && (
            <>
              <p className="text-sm text-secondary">
                <strong>{email}</strong> に確認コードを送信しました。
              </p>
              <label>
                <div className="text-sm text-secondary mb-1">
                  確認コード（6桁） <span className="text-red-500">*</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="input-field w-full text-center text-2xl tracking-[0.5em]"
                  onKeyDown={(e) => e.key === "Enter" && !busy && handleVerifyCode()}
                />
              </label>
              <button
                onClick={handleSendCode}
                disabled={busy}
                className="text-sm text-accent hover:underline text-left"
              >
                コードを再送信する
              </button>
            </>
          )}

          {/* ───── Step 3: Company info ───── */}
          {step === 3 && (
            <>
              {/* Business type selector */}
              <fieldset>
                <legend className="text-sm text-secondary mb-2">
                  事業形態 <span className="text-red-500">*</span>
                </legend>
                <div className="flex gap-3">
                  {([
                    { value: "corporation" as const, label: "法人" },
                    { value: "sole_proprietor" as const, label: "個人事業主" },
                  ]).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors text-sm ${
                        businessType === opt.value
                          ? "border-accent bg-accent/5 font-semibold text-primary"
                          : "border-neutral-200 hover:border-neutral-300 text-secondary"
                      }`}
                    >
                      <input
                        type="radio"
                        name="business_type"
                        value={opt.value}
                        checked={businessType === opt.value}
                        onChange={() => setBusinessType(opt.value)}
                        className="accent-accent"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Corporate number — required for corporation, hidden for sole proprietor */}
              {businessType === "corporation" && (
                <label>
                  <div className="text-sm text-secondary mb-1">
                    法人番号 <span className="text-red-500">*</span>
                  </div>
                  <div className="relative">
                    <input
                      value={corporateNumber}
                      onChange={(e) => handleCorporateNumberChange(e.target.value)}
                      placeholder="13桁の法人番号を入力"
                      maxLength={15}
                      className="input-field w-full pr-10"
                    />
                    {lookingUp && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {lookupDone && !lookingUp && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    法人番号を入力すると会社情報を自動取得します
                  </p>
                </label>
              )}

              <label>
                <div className="text-sm text-secondary mb-1">
                  {businessType === "corporation" ? "会社名" : "屋号・事業名"} <span className="text-red-500">*</span>
                </div>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={businessType === "corporation" ? "株式会社○○" : "○○自動車"}
                  className="input-field w-full"
                />
              </label>

              <label>
                <div className="text-sm text-secondary mb-1">
                  担当者名 <span className="text-red-500">*</span>
                </div>
                <input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="山田 太郎"
                  className="input-field w-full"
                />
              </label>

              <label>
                <div className="text-sm text-secondary mb-1">電話番号</div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03-1234-5678"
                  className="input-field w-full"
                />
              </label>

              <label>
                <div className="text-sm text-secondary mb-1">住所</div>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="東京都千代田区..."
                  className="input-field w-full"
                />
              </label>

              <label>
                <div className="text-sm text-secondary mb-1">
                  {businessType === "corporation" ? "代表者名" : "事業主名"}
                </div>
                <input
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder={businessType === "corporation" ? "代表取締役 ○○" : "○○ ○○"}
                  className="input-field w-full"
                />
              </label>
            </>
          )}

          {/* ───── Step 4: Terms ───── */}
          {step === 4 && (
            <>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-accent"
                  />
                  <span className="text-sm text-primary">
                    <a href="/terms" target="_blank" className="text-accent hover:underline">利用規約</a>
                    に同意します <span className="text-red-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-accent"
                  />
                  <span className="text-sm text-primary">
                    <a href="/privacy" target="_blank" className="text-accent hover:underline">プライバシーポリシー</a>
                    に同意します <span className="text-red-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={antiSocialAccepted}
                    onChange={(e) => setAntiSocialAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-accent"
                  />
                  <span className="text-sm text-primary">
                    反社会的勢力でないこと、及び反社会的勢力との関係がないことを表明・確約します <span className="text-red-500">*</span>
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ───── Step 5: Password ───── */}
          {step === 5 && (
            <>
              <label>
                <div className="text-sm text-secondary mb-1">
                  パスワード <span className="text-red-500">*</span>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上（大小文字・数字を含む）"
                  className="input-field w-full"
                />
              </label>
              <label>
                <div className="text-sm text-secondary mb-1">
                  パスワード（確認） <span className="text-red-500">*</span>
                </div>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  className="input-field w-full"
                  onKeyDown={(e) => e.key === "Enter" && !busy && handlePassword()}
                />
              </label>
              <ul className="text-xs text-muted space-y-0.5 ml-1">
                <li className={password.length >= 8 ? "text-green-600" : ""}>8文字以上</li>
                <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>大文字を含む</li>
                <li className={/[a-z]/.test(password) ? "text-green-600" : ""}>小文字を含む</li>
                <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>数字を含む</li>
              </ul>
            </>
          )}

          {/* ───── Step 6: Plan ───── */}
          {step === 6 && (
            <>
              <div className="space-y-3">
                {[
                  { value: "basic", label: "Basic", desc: "検索・閲覧（3ユーザーまで）" },
                  { value: "pro", label: "Pro", desc: "CSV/PDFエクスポート・ユーザー一括登録（20ユーザーまで）" },
                  { value: "enterprise", label: "Enterprise", desc: "全機能・API連携・無制限ユーザー" },
                ].map((plan) => (
                  <label
                    key={plan.value}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                      requestedPlan === plan.value
                        ? "border-accent bg-accent/5"
                        : "border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.value}
                      checked={requestedPlan === plan.value}
                      onChange={() => setRequestedPlan(plan.value)}
                      className="mt-1 accent-accent"
                    />
                    <div>
                      <div className="font-semibold text-primary">{plan.label}</div>
                      <div className="text-xs text-muted mt-0.5">{plan.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                登録後、管理者の審査が完了するまで一部機能が制限されます。
                審査完了後にメールでお知らせいたします。
              </div>
            </>
          )}

          {/* Error */}
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
              {err}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={() => { clearErr(); setStep((s) => (s - 1) as Step); }}
                disabled={busy}
                className="btn-secondary flex-1"
              >
                戻る
              </button>
            )}

            {step === 1 && (
              <button onClick={handleSendCode} disabled={busy} className="btn-primary flex-1">
                {busy ? "送信中..." : "確認コードを送信"}
              </button>
            )}
            {step === 2 && (
              <button onClick={handleVerifyCode} disabled={busy} className="btn-primary flex-1">
                {busy ? "確認中..." : "確認する"}
              </button>
            )}
            {step === 3 && (
              <button onClick={handleCompanyInfo} disabled={busy} className="btn-primary flex-1">
                次へ
              </button>
            )}
            {step === 4 && (
              <button onClick={handleTerms} disabled={busy} className="btn-primary flex-1">
                同意して次へ
              </button>
            )}
            {step === 5 && (
              <button onClick={handlePassword} disabled={busy} className="btn-primary flex-1">
                次へ
              </button>
            )}
            {step === 6 && (
              <button onClick={handleSubmit} disabled={busy} className="btn-primary flex-1">
                {busy ? "登録中..." : "登録する"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-muted">
          既にアカウントをお持ちの方は{" "}
          <a href="/insurer/login" className="text-accent hover:underline">
            ログイン
          </a>
        </p>
      </div>
    </main>
  );
}
