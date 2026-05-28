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
  status: "pending" | "submitted" | "completed" | "revoked" | "expired";
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  completed_customer_id: string | null;
  ocr_attempts: number;
  submitted_at: string | null;
  submitted_name: string | null;
  submitted_name_kana: string | null;
  submitted_email: string | null;
  submitted_phone: string | null;
  submitted_postal_code: string | null;
  submitted_address: string | null;
  submitted_birth_date: string | null;
  submitted_note: string | null;
}

interface DuplicateCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
    if (s === "submitted") return <Badge variant="violet">確認待ち</Badge>;
    if (s === "completed") return <Badge variant="success">登録済</Badge>;
    if (s === "expired") return <Badge variant="warning">期限切れ</Badge>;
    return <Badge variant="default">取消済</Badge>;
  }

  // ── 承認モーダル状態 ─────────────────────────────────
  const [reviewing, setReviewing] = useState<Invitation | null>(null);
  const [overrides, setOverrides] = useState<{
    name: string;
    name_kana: string;
    email: string;
    phone: string;
    postal_code: string;
    address: string;
    birth_date: string;
    note: string;
  }>({
    name: "",
    name_kana: "",
    email: "",
    phone: "",
    postal_code: "",
    address: "",
    birth_date: "",
    note: "",
  });
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);

  async function openReview(inv: Invitation) {
    setReviewing(inv);
    setOverrides({
      name: inv.submitted_name ?? "",
      name_kana: inv.submitted_name_kana ?? "",
      email: inv.submitted_email ?? "",
      phone: inv.submitted_phone ?? "",
      postal_code: inv.submitted_postal_code ?? "",
      address: inv.submitted_address ?? "",
      birth_date: inv.submitted_birth_date ?? "",
      note: inv.submitted_note ?? "",
    });
    setMergeInto(null);
    setApproveErr(null);
    setCandidates([]);
    try {
      const res = await fetch(`/api/admin/customer-intakes/${inv.id}/duplicates`);
      const j = await res.json().catch(() => null);
      if (res.ok && j?.candidates) setCandidates(j.candidates as DuplicateCandidate[]);
    } catch {
      // ignore
    }
  }

  function closeReview() {
    setReviewing(null);
    setApproving(false);
    setApproveErr(null);
    setCandidates([]);
    setMergeInto(null);
  }

  async function handleApprove() {
    if (!reviewing) return;
    if (!overrides.name.trim()) {
      setApproveErr("お名前は必須です");
      return;
    }
    setApproving(true);
    setApproveErr(null);
    try {
      const body: Record<string, unknown> = {
        overrides: {
          name: overrides.name.trim(),
          name_kana: overrides.name_kana.trim() || null,
          email: overrides.email.trim() || null,
          phone: overrides.phone.trim() || null,
          postal_code: overrides.postal_code.trim() || null,
          address: overrides.address.trim() || null,
          birth_date: overrides.birth_date.trim() || null,
          note: overrides.note.trim() || null,
        },
      };
      if (mergeInto) body.merge_into_customer_id = mergeInto;

      const res = await fetch(`/api/admin/customer-intakes/${reviewing.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setApproveErr(j?.error?.message ?? j?.message ?? "承認に失敗しました");
        return;
      }
      closeReview();
      mutate();
    } catch (e) {
      setApproveErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setApproving(false);
    }
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
              <th className="px-4 py-3 text-left">ラベル / 提出者</th>
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
                <td className="px-4 py-3 text-primary">
                  {inv.status === "submitted" && inv.submitted_name ? (
                    <div>
                      <div className="font-semibold">{inv.submitted_name} 様</div>
                      <div className="text-xs text-muted">{inv.label ?? "(ラベルなし)"}</div>
                    </div>
                  ) : (
                    (inv.label ?? <span className="text-muted">-</span>)
                  )}
                </td>
                <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                <td className="px-4 py-3 text-muted">{formatDate(inv.created_at)}</td>
                <td className="px-4 py-3 text-muted">{formatDate(inv.expires_at)}</td>
                <td className="px-4 py-3 text-muted">{inv.ocr_attempts}/10</td>
                <td className="px-4 py-3 text-right space-x-3">
                  {inv.status === "submitted" && (
                    <button type="button" className="text-xs text-accent font-semibold" onClick={() => openReview(inv)}>
                      確認・承認
                    </button>
                  )}
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

      {reviewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReview();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">確認・承認</div>
              <h2 className="mt-1 text-base font-semibold text-primary">
                顧客提出内容の確認 ({reviewing.label ?? "ラベルなし"})
              </h2>
              <p className="mt-1 text-xs text-muted">
                内容を確認・必要に応じて編集してから「承認して登録」を押すと顧客情報として登録されます。
              </p>
            </div>

            {candidates.length > 0 && (
              <div className="mb-4 rounded-xl border border-warning bg-warning-bg px-3 py-2 text-sm">
                <div className="font-semibold text-warning-text">同じ連絡先の既存顧客が見つかりました</div>
                <p className="mt-1 text-xs text-warning-text">
                  既存顧客にマージすると、空欄項目だけが今回の提出値で埋められます。
                </p>
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="merge" checked={mergeInto === null} onChange={() => setMergeInto(null)} />
                    新規顧客として登録
                  </label>
                  {candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="merge"
                        checked={mergeInto === c.id}
                        onChange={() => setMergeInto(c.id)}
                      />
                      <span>
                        {c.name} <span className="text-muted">({c.email ?? c.phone ?? "連絡先なし"})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="お名前 *"
                value={overrides.name}
                onChange={(v) => setOverrides((p) => ({ ...p, name: v }))}
              />
              <Field
                label="フリガナ"
                value={overrides.name_kana}
                onChange={(v) => setOverrides((p) => ({ ...p, name_kana: v }))}
              />
              <Field
                label="メール"
                value={overrides.email}
                onChange={(v) => setOverrides((p) => ({ ...p, email: v }))}
              />
              <Field label="電話" value={overrides.phone} onChange={(v) => setOverrides((p) => ({ ...p, phone: v }))} />
              <Field
                label="郵便番号"
                value={overrides.postal_code}
                onChange={(v) => setOverrides((p) => ({ ...p, postal_code: v }))}
              />
              <Field
                label="生年月日"
                value={overrides.birth_date}
                onChange={(v) => setOverrides((p) => ({ ...p, birth_date: v }))}
                placeholder="YYYY-MM-DD"
              />
              <div className="sm:col-span-2">
                <Field
                  label="住所"
                  value={overrides.address}
                  onChange={(v) => setOverrides((p) => ({ ...p, address: v }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted">備考</label>
                <textarea
                  value={overrides.note}
                  onChange={(e) => setOverrides((p) => ({ ...p, note: e.target.value }))}
                  className="input-field"
                  rows={2}
                />
              </div>
            </div>

            {approveErr && (
              <div className="mt-3 rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
                {approveErr}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeReview} disabled={approving}>
                閉じる
              </button>
              <button type="button" className="btn-primary" onClick={handleApprove} disabled={approving}>
                {approving ? "登録中…" : mergeInto ? "既存顧客に追記" : "承認して登録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">{label}</label>
      <input
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
