"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { getStatusEntry, SIGNING_STATUS_MAP } from "@/lib/statusMaps";
import { formatDateTime } from "@/lib/format";

type Contract = {
  id: string;
  agent_id: string;
  template_type: string;
  title: string;
  status: string;
  signer_email: string;
  signer_name: string;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  // Ledra 自前署名エンジン
  sign_engine?: string;
  sign_url?: string | null;
  ledra_session_id?: string | null;
};

const TEMPLATE_LABELS: Record<string, string> = {
  agent_contract: "代理店契約書",
  nda: "秘密保持契約（NDA）",
  other: "その他",
};

export default function AgentContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copySignUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agent/contracts");
        const data = await res.json();
        if (res.ok) setContracts(data.contracts ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">契約書</h1>
        <p className="text-sm text-muted mt-1">
          本部から送付された契約書・署名依頼を確認できます。
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-muted">読み込み中...</div>
      ) : contracts.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          契約書はまだありません。
        </div>
      ) : (
        <div className="glass-card divide-y divide-default">
          {contracts.map((c) => {
            const statusEntry = getStatusEntry(SIGNING_STATUS_MAP, c.status);
            const canSign = c.status === "sent" || c.status === "viewed";

            return (
              <div key={c.id} className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-primary">{c.title}</p>
                      <Badge variant={statusEntry.variant}>{statusEntry.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      <span>{TEMPLATE_LABELS[c.template_type] ?? c.template_type}</span>
                      <span>署名者: {c.signer_name}</span>
                      {c.sent_at && <span>送信日: {formatDateTime(c.sent_at)}</span>}
                      {c.signed_at && <span>署名日: {formatDateTime(c.signed_at)}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {/* Ledra 自前署名: 署名ページへのリンク */}
                    {canSign && c.sign_url && (
                      <a
                        href={c.sign_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                   bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold
                                   transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        署名する
                      </a>
                    )}
                    {/* Ledra 自前署名: URL コピーボタン（別デバイス共有用） */}
                    {canSign && c.sign_url && (
                      <button
                        onClick={() => copySignUrl(c.id, c.sign_url!)}
                        className="text-xs text-gray-500 hover:text-indigo-600 transition-colors"
                      >
                        {copiedId === c.id ? "✅ コピー済み" : "🔗 URLをコピー"}
                      </button>
                    )}
                    {/* 署名待ち（署名URLなしの場合） */}
                    {canSign && !c.sign_url && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        署名待ち
                      </span>
                    )}
                    {/* 署名完了 */}
                    {c.status === "signed" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        署名完了
                      </span>
                    )}
                    {/* 検証リンク */}
                    {c.status === "signed" && c.ledra_session_id && (
                      <a
                        href={`/verify/${c.ledra_session_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                      >
                        🔍 署名を検証
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
