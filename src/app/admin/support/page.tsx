"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";

const CATEGORIES = [
  { value: "technical", label: "技術的なご質問" },
  { value: "billing", label: "請求・プランについて" },
  { value: "feature", label: "機能のご要望" },
  { value: "bug", label: "不具合のご報告" },
  { value: "other", label: "その他" },
];

// デフォルトのQ&A（コード内蔵、DBが空でも表示される）
const DEFAULT_FAQ = [
  { q: "証明書の発行方法を教えてください", a: "左メニューの「証明書管理」→「+ 新規発行」から車両情報・施工内容を入力して発行できます。テンプレートを選択すると、施工種別に応じたフォーマットが自動適用されます。" },
  { q: "テンプレートを変更したい", a: "「ブランド証明書」メニューからプランを選択し、ライト（既製テンプレ+ロゴ反映）またはプレミアム（オリジナルデザイン制作）をお申し込みください。" },
  { q: "請求書のロゴや角印を設定したい", a: "「店舗設定」→「ロゴ設定」からロゴ画像をアップロードできます。角印は「角印・社印」欄からアップロード可能です。帳票・請求書に自動反映されます。" },
  { q: "プランを変更したい", a: "「請求・プラン」メニューから現在のプランを確認し、変更したいプランの「このプランを選択」ボタンからお手続きいただけます。" },
  { q: "Googleカレンダーと連携したい", a: "「予約管理」ページ上部の「Googleカレンダーと連携」ボタンからGoogleアカウントで認証すると、予約が自動同期されます。※環境設定が必要な場合は運営にお問い合わせください。" },
  { q: "NFCタグの追加購入方法", a: "現在NFCタグの追加購入ページは準備中です。追加ご希望の場合は下記フォームよりお問い合わせください。" },
  { q: "CSVでデータをインポートしたい", a: "各管理ページ（車両、顧客、品目など）に「CSVインポート」ボタンがある場合、見本CSVをダウンロードしてデータを記入後アップロードしてください。" },
  { q: "パスワードを忘れた", a: "ログイン画面の「パスワードを忘れた方」リンクからメールアドレスを入力してリセットできます。" },
];

type FaqItem = { id?: string; q: string; a: string };

export default function AdminSupportPage() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [faqItems, setFaqItems] = useState<FaqItem[]>(DEFAULT_FAQ);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // 運営がDBに追加したFAQを読み込み
  const fetchFaq = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/faq", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.items?.length) {
          setFaqItems([...j.items, ...DEFAULT_FAQ]);
        }
      }
    } catch { /* DB未設定時はデフォルトFAQのみ */ }
  }, []);

  useEffect(() => { fetchFaq(); }, [fetchFaq]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name") as string,
      email: fd.get("email") as string,
      company: fd.get("company") as string,
      category: `管理画面: ${fd.get("category") as string}`,
      message: fd.get("message") as string,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "送信に失敗しました");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <PageHeader tag="サポート" title="サポート" description="よくある質問と運営へのお問い合わせ" />
        <div className="glass-card p-8 text-center space-y-4">
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-dim">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-success">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </span>
          </div>
          <h2 className="text-lg font-semibold text-primary">お問い合わせを受け付けました</h2>
          <p className="text-sm text-secondary">
            通常1〜2営業日以内にご返信いたします。<br />
            お急ぎの場合は <a href="mailto:info@cartrust.co.jp" className="text-accent hover:underline">info@cartrust.co.jp</a> までご連絡ください。
          </p>
          <button onClick={() => setSent(false)} className="btn-secondary mt-4">
            新しいお問い合わせ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader tag="サポート" title="サポート" description="よくある質問と運営へのお問い合わせ" />

      {/* ━━━ Q&A セクション ━━━ */}
      <section className="glass-card p-6">
        <h2 className="text-base font-semibold text-primary mb-4 flex items-center gap-2">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-accent">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
          よくある質問
        </h2>
        <div className="divide-y divide-border-subtle">
          {faqItems.map((item, i) => (
            <div key={item.id ?? i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between py-3.5 text-left text-sm font-medium text-primary hover:text-accent transition-colors"
              >
                <span>{item.q}</span>
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`shrink-0 ml-3 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="pb-3.5 pl-1 text-sm text-secondary leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ 問い合わせフォーム ━━━ */}
      <section>
        <h2 className="text-base font-semibold text-primary mb-3">解決しない場合はお問い合わせください</h2>
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5 max-w-2xl">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-primary">お名前 <span className="text-danger">*</span></label>
            <input id="name" name="name" required className="input-field" placeholder="山田 太郎" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-primary">メールアドレス <span className="text-danger">*</span></label>
            <input id="email" name="email" type="email" required className="input-field" placeholder="taro@example.com" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="company" className="text-sm font-medium text-primary">会社名 / 店舗名</label>
            <input id="company" name="company" className="input-field" placeholder="株式会社○○" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="category" className="text-sm font-medium text-primary">お問い合わせ種別 <span className="text-danger">*</span></label>
            <select id="category" name="category" required className="select-field">
              <option value="">選択してください</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="message" className="text-sm font-medium text-primary">お問い合わせ内容 <span className="text-danger">*</span></label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              className="input-field resize-y"
              placeholder="お問い合わせ内容をご記入ください"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-danger-dim border border-danger/20 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button type="submit" disabled={sending} className="btn-primary">
            {sending ? "送信中..." : "送信する"}
          </button>
        </form>
      </section>
    </div>
  );
}
