"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import { getServiceTypeLabel } from "@/lib/certificates/serviceTypeLabel";
import type { LinkedWork } from "@/lib/staff/tenantLink";

/**
 * 元請けから連携された「自分が作業した記録」の一覧と、連携コードの入力。
 *
 * ここに出るのは自分が施工したものだけで、元請けのテナント全体は見えない。
 * 顧客名も出さない（代表判断 2026-09-03）。詳細は公開証明書へ送る。
 */
export default function LinkedWorkClient({ initial }: { initial: LinkedWork }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/linked-work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "連携できませんでした。");
      setCode("");
      setMsg({ text: `${j.client_name} と連携しました。`, ok: true });
      router.refresh();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="LINKED WORK"
        title="受注先での施工実績"
        description="元請けから連携されると、自分が施工した記録がここに集まります"
      />

      <section className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-primary">連携コードを入力</h2>
        <p className="text-xs leading-5 text-secondary">
          元請けから受け取ったコードを入力すると、その元請けで<span className="font-semibold">自分が施工した記録</span>
          が見られるようになります。元請けの他のデータやお客様の情報は表示されません。
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例: A3F7K9M2QX"
            className="input-field max-w-xs font-mono tracking-widest"
          />
          <button
            type="button"
            disabled={busy || !code.trim()}
            onClick={redeem}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
          >
            {busy ? "確認中…" : "連携する"}
          </button>
        </div>
        {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</div>}
      </section>

      {initial.groups.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">
          まだ連携している元請けがありません。上のコード入力から連携してください。
        </div>
      ) : (
        <>
          <div className="text-sm text-secondary">
            全 {initial.total_certificates} 件 / {initial.groups.length} 社
          </div>
          {initial.groups.map((group) => (
            <section key={`${group.client_name}-${group.staff_name}`} className="glass-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-primary">
                {group.client_name}
                <span className="ml-2 text-xs font-normal text-muted">{group.certificates.length} 件</span>
              </h2>
              {group.certificates.length === 0 ? (
                <div className="text-xs text-muted">まだ施工証明が記録されていません。</div>
              ) : (
                <ul className="space-y-2">
                  {group.certificates.map((cert) => (
                    <li key={cert.public_id}>
                      <a
                        href={`/c/${cert.public_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border-default px-4 py-3 text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{getServiceTypeLabel(cert.service_type)}</span>
                        <span className="shrink-0 text-muted">{formatDate(cert.created_at)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      <p className="text-xs leading-5 text-muted">
        連携は元請け側からいつでも解除できます。解除されると、その元請けの実績は表示されなくなります。
      </p>
    </div>
  );
}
