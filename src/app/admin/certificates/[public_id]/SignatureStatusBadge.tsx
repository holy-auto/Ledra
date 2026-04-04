'use client';

/**
 * SignatureStatusBadge
 *
 * 証明書詳細ページに表示する電子署名ステータスバッジ。
 * pending / signed / expired / cancelled の各状態を色付きで表示。
 */

import Link from 'next/link';

interface Props {
  status:      string;
  signedAt:    string | null;
  expiresAt:   string;
  signerEmail: string | null;
  signerName:  string | null;
  sessionId:   string;
  notifiedAt:  string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SignatureStatusBadge({
  status,
  signedAt,
  expiresAt,
  signerEmail,
  signerName,
  sessionId,
  notifiedAt,
}: Props) {
  const isExpired = status === 'pending' && new Date(expiresAt) < new Date();
  const effectiveStatus = isExpired ? 'expired' : status;

  const config: Record<string, { label: string; color: string; icon: string; desc: string }> = {
    pending: {
      label: '署名待ち',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      icon:  '⏳',
      desc:  `${signerName ?? signerEmail ?? '顧客'} に送信済み`,
    },
    signed: {
      label: '署名完了',
      color: 'bg-green-100 text-green-800 border-green-200',
      icon:  '✅',
      desc:  signedAt ? `${formatDate(signedAt)} に完了` : '署名済み',
    },
    expired: {
      label: '期限切れ',
      color: 'bg-gray-100 text-gray-600 border-gray-200',
      icon:  '⌛',
      desc:  `${formatDate(expiresAt)} で期限切れ`,
    },
    cancelled: {
      label: 'キャンセル済み',
      color: 'bg-red-100 text-red-700 border-red-200',
      icon:  '✖️',
      desc:  'キャンセルされました',
    },
  };

  const cfg = config[effectiveStatus] ?? config['pending'];

  return (
    <div className={`flex flex-col items-end gap-1`}>
      {/* ステータスバッジ */}
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color}`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>

      {/* 詳細テキスト */}
      <p className="text-xs text-muted text-right">{cfg.desc}</p>

      {/* 通知日時 */}
      {notifiedAt && (
        <p className="text-xs text-muted text-right">
          通知: {formatDate(notifiedAt)}
        </p>
      )}

      {/* 検証リンク（署名済みの場合） */}
      {effectiveStatus === 'signed' && (
        <Link
          href={`/verify/${sessionId}`}
          target="_blank"
          className="text-xs text-accent underline hover:text-accent/80"
        >
          署名を検証する →
        </Link>
      )}
    </div>
  );
}
