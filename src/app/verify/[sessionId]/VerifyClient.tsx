'use client';

/**
 * VerifyClient — 電子署名検証ページ
 *
 * /verify/[sessionId] で公開される第三者向け検証ページ。
 * ECDSA P-256 署名の暗号的検証結果をわかりやすく表示する。
 *
 * 電子署名法第2条第2号（非改ざん性）の外部検証窓口。
 */

import React, { useEffect, useState } from 'react';

type VerifyPhase = 'loading' | 'valid' | 'invalid' | 'not_signed' | 'error';

interface SessionInfo {
  id:                     string;
  signed_at:              string | null;
  signer_email_masked:    string;
  document_hash:          string;
  document_hash_alg:      string;
  public_key_fingerprint: string;
  key_version:            string;
}

interface VerifyResult {
  is_valid:     boolean;
  status:       string;
  message:      string;
  session:      SessionInfo;
  certificate:  { public_id: string } | null;
  verified_at:  string;
}

export default function VerifyClient({ sessionId }: { sessionId: string }) {
  const [phase, setPhase]   = useState<VerifyPhase>('loading');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`/api/signature/verify/${sessionId}`);
        const json = await res.json();

        if (!res.ok) {
          setErrorMsg(json.message ?? '検証に失敗しました');
          setPhase('error');
          return;
        }

        setResult(json);

        if (json.is_valid) {
          setPhase('valid');
        } else if (json.status === 'pending') {
          setPhase('not_signed');
        } else {
          setPhase('invalid');
        }
      } catch {
        setErrorMsg('通信エラーが発生しました');
        setPhase('error');
      }
    })();
  }, [sessionId]);

  // ── ローディング ──────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">署名を検証中...</p>
        </div>
      </div>
    );
  }

  // ── エラー ────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-white text-2xl font-bold mb-3">検証エラー</h1>
          <p className="text-gray-400">{errorMsg}</p>
          <Footer />
        </div>
      </div>
    );
  }

  // ── 未署名 ────────────────────────────────────────────────
  if (phase === 'not_signed') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h1 className="text-white text-2xl font-bold mb-3">未署名</h1>
          <p className="text-gray-400">この文書はまだ電子署名されていません。</p>
          <Footer />
        </div>
      </div>
    );
  }

  // ── 無効（改ざん検出） ────────────────────────────────────
  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">❌</div>
            <h1 className="text-red-400 text-2xl font-bold mb-2">署名が無効です</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              {result?.message}
            </p>
          </div>
          <div className="bg-red-950/30 border border-red-800 rounded-2xl p-5 mb-4">
            <p className="text-red-300 text-sm font-semibold mb-2">⚠️ 警告</p>
            <p className="text-red-200 text-sm leading-relaxed">
              この証明書は改ざんされているか、署名データが破損している可能性があります。
              証明書の発行元に問い合わせてください。
            </p>
          </div>
          {result?.session && <SessionDetailCard session={result.session} certPublicId={result.certificate?.public_id} />}
          <Footer />
        </div>
      </div>
    );
  }

  // ── 有効 ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-md">

        {/* ヘッダー */}
        <div className="text-center mb-6">
          <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
            <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">署名は有効です</h1>
          <p className="text-gray-400 text-sm">
            ECDSA P-256 による暗号的検証が成功しました
          </p>
        </div>

        {/* 法的準拠バッジ */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl shrink-0">⚖️</span>
          <div>
            <p className="text-blue-300 text-sm font-semibold">電子署名法準拠</p>
            <p className="text-gray-400 text-xs leading-relaxed mt-0.5">
              電子署名法（平成12年法律第102号）第2条に基づく立会人型電子署名。
              本人性・非改ざん性が暗号的に保証されています。
            </p>
          </div>
        </div>

        {/* 署名詳細 */}
        {result?.session && (
          <SessionDetailCard
            session={result.session}
            certPublicId={result.certificate?.public_id}
            verifiedAt={result.verified_at}
          />
        )}

        <Footer />
      </div>
    </div>
  );
}

// ── 署名詳細カード ──────────────────────────────────────────

function SessionDetailCard({
  session,
  certPublicId,
  verifiedAt,
}: {
  session:      SessionInfo;
  certPublicId?: string;
  verifiedAt?:  string;
}) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4 space-y-4">
      <h2 className="text-gray-300 text-sm font-semibold">署名の詳細情報</h2>

      <div className="space-y-3">
        {session.signed_at && (
          <InfoRow
            label="署名日時"
            value={new Date(session.signed_at).toLocaleString('ja-JP', {
              year:   'numeric',
              month:  '2-digit',
              day:    '2-digit',
              hour:   '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          />
        )}
        <InfoRow label="署名者（マスク）" value={session.signer_email_masked} />
      </div>

      {/* ハッシュ・暗号情報 */}
      <div className="border-t border-gray-800 pt-4 space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">暗号情報</p>
        <InfoRow label="ハッシュアルゴリズム" value={session.document_hash_alg || 'SHA-256'} />
        <div>
          <p className="text-gray-500 text-xs mb-1">ドキュメントハッシュ</p>
          <p className="text-gray-300 text-xs font-mono break-all bg-gray-800 rounded-lg p-2">
            {session.document_hash}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-1">公開鍵フィンガープリント</p>
          <p className="text-gray-300 text-xs font-mono break-all bg-gray-800 rounded-lg p-2">
            {session.public_key_fingerprint}
          </p>
        </div>
        <InfoRow label="鍵バージョン" value={session.key_version} mono />
      </div>

      {/* 証明書リンク */}
      {certPublicId && (
        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-500 text-xs mb-2">関連証明書</p>
          <a
            href={`/c/${certPublicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 text-sm hover:underline"
          >
            <span>🔗</span>
            <span>証明書公開ページを表示</span>
          </a>
        </div>
      )}

      {/* 検証日時 */}
      {verifiedAt && (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-gray-600 text-xs">
            検証日時: {new Date(verifiedAt).toLocaleString('ja-JP')}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-gray-500 text-sm shrink-0">{label}</dt>
      <dd className={`text-gray-200 text-sm text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-8 text-center text-gray-600 text-xs">
      <span className="text-blue-400 font-semibold">Ledra</span> 電子署名検証システム
      <br />
      ECDSA P-256 / 電子署名法（平成12年法律第102号）
    </div>
  );
}
