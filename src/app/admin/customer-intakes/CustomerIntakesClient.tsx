"use client";

/**
 * 事前カルテ招待管理画面.
 *
 * - 招待一覧 (status 別)
 * - 新規招待発行 → URL + QR を表示
 * - 既存招待の取り消し (revoke)
 */
import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { fetcher } from "@/lib/swr";

interface Invitation {
  id: string;
  short_id: string;
  store_id: string | null;
  label: string | null;
  status: "pending" | "completed" | "revoked" | "expired";
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  completed_customer_id: string | null;
  ocr_attempts: number;
}

interface ListResp {
  ok: true;
  invitations: Invitation[];
}

interface CreateResp {
  ok: true;
  id: string;
  short_id: string;
  url: string;
  expires_at: string;
}

export default function CustomerIntakesClient() {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [contactEmail, setContactEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResp | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const { data, mutate } = useSWR<ListResp>("/api/admin/customer-intakes", fetcher);

  async function handleCreate() {
    setCreating(true);
    setCreateErr(null);
    setCreated(null);
    setQrSvg(null);
    try {
      const res = await fetch("/api/admin/customer-intakes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          contact_email: contactEmail.trim() || null,
          expiry_days: expiryDays,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        setCreateErr(j?.error?.message ?? j?.message ?? "発行に失敗しました");
        return;
      }
      setCreated(j);
      // QR を動的生成 (qrcode library を動的 import)
      const { default: QRCode } = await import("qrcode");
      const svg = await QRCode.toString(j.url, { type: "svg", margin: 1, width: 256 });
      setQrSvg(svg);
      mutate();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("この招待を取り消しますか？")) return;
    const res = await fetch(`/api/admin/customer-intakes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("取消しに失敗しました");
      return;
    }
    mutate();
  }

  function copyUrl() {
    if (!created) return;
    void navigator.clipboard.writeText(created.url);
  }

  function statusBadge(s: Invitation["status"]) {
    if (s === "pending") return <Badge variant="info">未送信</Badge>;
    if (s === "completed") return <Badge variant="success">完了</Badge>;
    if (s === "expired") return <Badge variant="warning">期限切れ</Badge>;
    return <Badge variant="default">取消済</Badge>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        tag="事前カルテ"
        title="事前カルテ招待"
        description="顧客にURLまたはQRコードを送って、来店前にカルテ情報を入力してもらえます。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm((v) => !v);
              setCreated(null);
              setQrSvg(null);
              setCreateErr(null);
            }}
          >
            {showForm ? "閉じる" : "新規発行"}
          </button>
        }
      />

      {showForm && (
        <section className="glass-card p-5 space-y-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規発行</div>

          {!created ? (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted">ラベル (任意 / 顧客識別用)</label>
                <input
                  className="input-field"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="例: 山田様 初診カルテ"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">送付先メール (任意 / 履歴用)</label>
                <input
                  className="input-field"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="customer@example.com"
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">有効期限 (1〜30 日)</label>
                <input
                  className="input-field w-32"
                  type="number"
                  min={1}
                  max={30}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value) || 7)}
                />
              </div>

              {createErr && (
                <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
                  {createErr}
                </div>
              )}

              <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? "発行中…" : "URL/QR を発行"}
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-success-border bg-success-bg px-3 py-2 text-sm text-success-text">
                発行しました。下記の URL または QR を顧客に共有してください。
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">URL</label>
                <div className="flex gap-2">
                  <input className="input-field flex-1" readOnly value={created.url} />
                  <button type="button" className="btn-secondary" onClick={copyUrl}>
                    コピー
                  </button>
                </div>
                <p className="text-xs text-muted">※ この URL は今だけ表示されます。閉じると再表示できません。</p>
              </div>

              {qrSvg && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border-default bg-surface p-4">
                  <div
                    className="rounded-lg bg-white p-2 [&_svg]:h-48 [&_svg]:w-48"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <p className="text-xs text-muted">QR を顧客のスマホで読み取ってもらえます</p>
                </div>
              )}

              <p className="text-xs text-muted">有効期限: {formatDate(created.expires_at)} まで</p>
            </div>
          )}
        </section>
      )}

      <section className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 text-left">ラベル</th>
              <th className="px-4 py-3 text-left">状態</th>
              <th className="px-4 py-3 text-left">作成日</th>
              <th className="px-4 py-3 text-left">期限</th>
              <th className="px-4 py-3 text-left">OCR 利用</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.invitations ?? []).map((inv) => (
              <tr key={inv.id} className="border-t border-border-default/50">
                <td className="px-4 py-3 text-primary">{inv.label ?? <span className="text-muted">-</span>}</td>
                <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                <td className="px-4 py-3 text-muted">{formatDate(inv.created_at)}</td>
                <td className="px-4 py-3 text-muted">{formatDate(inv.expires_at)}</td>
                <td className="px-4 py-3 text-muted">{inv.ocr_attempts}/10</td>
                <td className="px-4 py-3 text-right">
                  {inv.status === "pending" && (
                    <button type="button" className="text-xs text-danger" onClick={() => handleRevoke(inv.id)}>
                      取り消す
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!data || data.invitations.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  まだ発行された招待はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
