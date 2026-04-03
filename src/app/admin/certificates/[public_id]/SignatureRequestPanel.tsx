'use client';

/**
 * SignatureRequestPanel
 *
 * 証明書詳細ページ（管理画面）に表示する電子署名依頼パネル。
 * 施工店スタッフが顧客へワンタイム署名 URL を発行・共有するためのUI。
 *
 * 電子署名法第2条第1号（本人性）の起点となるワークフロー。
 */

import { useState } from 'react';

type SignatureStatus = 'idle' | 'submitting' | 'done' | 'error' | 'already_pending';

interface SignResult {
  session_id:  string;
  sign_url:    string;
  expires_at:  string;
  is_existing?: boolean;
}

interface Props {
  /** certificates.id（UUID） */
  certificateId: string;
}

export default function SignatureRequestPanel({ certificateId }: Props) {
  const [open, setOpen]           = useState(false);
  const [signerName, setSignerName]   = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [notificationMethod, setNotificationMethod] = useState<'email' | 'line' | 'sms'>('email');
  const [status, setStatus]       = useState<SignatureStatus>('idle');
  const [result, setResult]       = useState<SignResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [copied, setCopied]       = useState(false);

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
    setCopied(false);
  };

  const handleSubmit = async () => {
    if (!signerEmail.includes('@')) {
      setErrorMsg('有効なメールアドレスを入力してください');
      return;
    }
    setErrorMsg('');
    setStatus('submitting');

    try {
      const res  = await fetch('/api/signature/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          certificate_id:      certificateId,
          signer_name:         signerName || undefined,
          signer_email:        signerEmail,
          signer_phone:        signerPhone || undefined,
          notification_method: notificationMethod,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.message ?? '署名依頼の作成に失敗しました');
        setStatus('error');
        return;
      }

      setResult(json);
      setStatus(json.is_existing ? 'already_pending' : 'done');
    } catch {
      setErrorMsg('通信エラーが発生しました');
      setStatus('error');
    }
  };

  const copyUrl = async () => {
    if (!result?.sign_url) return;
    await navigator.clipboard.writeText(result.sign_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── 閉じた状態のトリガーボタン ──────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3
                   text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition-colors
                   text-left flex items-center gap-2"
      >
        <span>✍️</span>
        <span>電子署名を依頼する</span>
      </button>
    );
  }

  // ── 依頼完了後のビュー ──────────────────────────────────────
  if (status === 'done' || status === 'already_pending') {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-lg">✅</span>
            <span className="text-sm font-semibold text-primary">
              {status === 'already_pending' ? '有効な署名依頼が存在します' : '署名URLを発行しました'}
            </span>
          </div>
          <button
            onClick={() => { setOpen(false); reset(); }}
            className="text-muted text-xs hover:text-primary"
          >
            閉じる
          </button>
        </div>

        {/* 署名URL表示 */}
        <div className="rounded-xl bg-base p-3 space-y-2">
          <p className="text-xs text-muted">署名リンク（有効期限: 24時間）</p>
          <p className="text-xs font-mono text-blue-300 break-all">
            {result?.sign_url}
          </p>
          <div className="text-xs text-muted">
            有効期限: {result?.expires_at
              ? new Date(result.expires_at).toLocaleString('ja-JP')
              : '—'}
          </div>
        </div>

        {/* コピーボタン */}
        <button
          onClick={copyUrl}
          className="w-full rounded-xl border border-border-default bg-surface px-4 py-2.5
                     text-sm text-secondary hover:bg-base transition-colors"
        >
          {copied ? '✅ コピーしました' : '🔗 署名URLをコピー'}
        </button>

        <p className="text-xs text-muted leading-relaxed">
          このURLを顧客にメール・LINE等で共有してください。
          顧客がURLを開き「署名する」ボタンを押すと電子署名が完了します。
        </p>
      </div>
    );
  }

  // ── 入力フォーム ──────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✍️</span>
          <span className="text-sm font-semibold text-primary">電子署名依頼</span>
        </div>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-muted text-xs hover:text-primary"
        >
          キャンセル
        </button>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        顧客情報を入力すると署名URLが発行されます。
        URLを顧客に共有することで電子署名（電子署名法第2条）を取得できます。
      </p>

      {/* 顧客名 */}
      <div>
        <label className="block text-xs text-muted mb-1">顧客名（任意）</label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="山田 太郎"
          className="w-full rounded-lg border border-border-default bg-base px-3 py-2
                     text-sm text-primary placeholder-muted
                     focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* メールアドレス */}
      <div>
        <label className="block text-xs text-muted mb-1">
          メールアドレス <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          value={signerEmail}
          onChange={(e) => setSignerEmail(e.target.value)}
          placeholder="customer@example.com"
          autoComplete="off"
          className="w-full rounded-lg border border-border-default bg-base px-3 py-2
                     text-sm text-primary placeholder-muted
                     focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <p className="text-xs text-muted mt-1">署名の本人性証跡として記録されます</p>
      </div>

      {/* 電話番号 */}
      <div>
        <label className="block text-xs text-muted mb-1">電話番号（任意）</label>
        <input
          type="tel"
          value={signerPhone}
          onChange={(e) => setSignerPhone(e.target.value)}
          placeholder="090-0000-0000"
          className="w-full rounded-lg border border-border-default bg-base px-3 py-2
                     text-sm text-primary placeholder-muted
                     focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 通知方法 */}
      <div>
        <label className="block text-xs text-muted mb-1">通知方法</label>
        <div className="flex gap-2">
          {(['email', 'line', 'sms'] as const).map((method) => (
            <button
              key={method}
              onClick={() => setNotificationMethod(method)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                ${notificationMethod === method
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-border-default bg-surface text-muted hover:bg-base'
                }`}
            >
              {method === 'email' ? '📧 メール' : method === 'line' ? '💬 LINE' : '📱 SMS'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-1">
          ※現在はURLを手動で共有してください（通知機能は近日実装予定）
        </p>
      </div>

      {/* エラー */}
      {(status === 'error' || errorMsg) && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        disabled={status === 'submitting' || !signerEmail.includes('@')}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white
                   hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'submitting' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⟳</span>
            処理中...
          </span>
        ) : (
          '署名URLを発行する'
        )}
      </button>

      {/* 法的注記 */}
      <p className="text-xs text-muted leading-relaxed">
        発行された署名URLは24時間有効です。
        電子署名法（平成12年法律第102号）に基づく立会人型電子署名として証跡を記録します。
      </p>
    </div>
  );
}
