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
};

const TEMPLATE_LABELS: Record<string, string> = {
  agent_contract: "代理店契約書",
  nda: "秘密保持契約（NDA）",
  other: "その他",
};

export default function AgentContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

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

  const handleOpenContract = async (contract: Contract) => {
    setOpeningId(contract.id);
    setDemoNotice(null);
    try {
      const res = await fetch(`/api/agent/contracts/${contract.id}/signing-url`);
      const data = await res.json();

      if (res.ok) {
        if (data.demo) {
          setDemoNotice(data.message ?? "デモ用契約書です。");
        } else if (data.signing_url) {
          window.open(data.signing_url, "_blank", "noopener,noreferrer");
          // Optimistically mark as viewed in local state
          setContracts((prev) =>
            prev.map((c) =>
              c.id === contract.id && c.status === "sent"
                ? { ...c, status: "viewed" }
                : c,
            ),
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">契約書</h1>
        <p className="text-sm text-muted mt-1">
          本部から送付された契約書・署名依頼を確認できます。
        </p>
      </div>

      {demoNotice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {demoNotice}
        </div>
      )}

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

                  <div className="shrink-0 flex items-center gap-3">
                    {canSign && (
                      <button
                        onClick={() => handleOpenContract(c)}
                        disabled={openingId === c.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {openingId === c.id ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            開いています...
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            契約書を開く
                          </>
                        )}
                      </button>
                    )}
                    {c.status === "signed" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        署名完了
                      </span>
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
