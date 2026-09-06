"use client";

import { useCallback, useEffect, useState } from "react";
import { jstLocalInputToUtcIso } from "@/lib/datetime";

type Consumer = {
  id: string;
  name: string;
  contact_email: string;
  status: "active" | "suspended" | "closed" | string;
  monthly_quota: number;
  rate_limit_per_minute: number;
  stripe_customer_id: string | null;
  stripe_subscription_item_id: string | null;
  created_at: string;
  updated_at: string;
};

type BillingPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  call_count: number;
  reported_to_stripe_at: string | null;
  stripe_usage_record_id: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
};

type KeyItem = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: "active" | "revoked" | "expired" | string;
};

type Stats = {
  call_count_30d: number;
  error_count_30d: number;
  endpoint_breakdown: { endpoint: string; count: number }[];
  last_call_at: string | null;
};

type CallLog = {
  id: number | string;
  api_key_id: string | null;
  endpoint: string;
  vin_queried_normalized: string | null;
  response_status: number;
  response_time_ms: number | null;
  ip_hash: string | null;
  user_agent: string | null;
  called_at: string;
};

const KNOWN_SCOPES = ["passport:verify", "passport:marketplace", "*"] as const;

const STATUS_LABEL: Record<string, string> = {
  active: "アクティブ",
  suspended: "停止中",
  closed: "解約済み",
  revoked: "失効",
  expired: "期限切れ",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-800",
  closed: "bg-zinc-200 text-zinc-600",
  revoked: "bg-rose-100 text-rose-700",
  expired: "bg-zinc-200 text-zinc-600",
};

function fmtDateTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  // 失効判定はサーバ側なので、表示も入力も JST 固定にする（ブラウザ TZ 依存を外す）。
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function ConsumerDetailClient({ consumerId }: { consumerId: string }) {
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsLoadedOnce, setCallsLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStatus, setEditStatus] = useState<string>("active");
  const [editQuota, setEditQuota] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editStripeCustomer, setEditStripeCustomer] = useState("");
  const [editStripeSubItem, setEditStripeSubItem] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["passport:verify"]);
  const [keyExpiresAt, setKeyExpiresAt] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [freshlyIssued, setFreshlyIssued] = useState<{ name: string; rawKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/platform/passport-consumers/${consumerId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "load_failed");
      const c = j.consumer as Consumer;
      setConsumer(c);
      setKeys((j.keys ?? []) as KeyItem[]);
      setStats((j.stats ?? null) as Stats | null);
      setBillingPeriods((j.billing_periods ?? []) as BillingPeriod[]);
      setEditName(c.name);
      setEditEmail(c.contact_email);
      setEditStatus(c.status);
      setEditQuota(String(c.monthly_quota));
      setEditRate(String(c.rate_limit_per_minute));
      setEditStripeCustomer(c.stripe_customer_id ?? "");
      setEditStripeSubItem(c.stripe_subscription_item_id ?? "");
    } catch {
      setErr("詳細の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [consumerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCalls = useCallback(async () => {
    setLoadingCalls(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/platform/passport-consumers/${consumerId}/calls?limit=100`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "load_failed");
      setCallLogs((j.calls ?? []) as CallLog[]);
      setCallsLoadedOnce(true);
    } catch {
      setErr("コール履歴の取得に失敗しました。");
    } finally {
      setLoadingCalls(false);
    }
  }, [consumerId]);

  async function saveEdit() {
    setSavingEdit(true);
    setEditSaved(false);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {};
      if (consumer && editName !== consumer.name) payload.name = editName.trim();
      if (consumer && editEmail !== consumer.contact_email) payload.contact_email = editEmail.trim();
      if (consumer && editStatus !== consumer.status) payload.status = editStatus;
      const q = Number(editQuota);
      if (consumer && Number.isInteger(q) && q !== consumer.monthly_quota) payload.monthly_quota = q;
      const r = Number(editRate);
      if (consumer && Number.isInteger(r) && r !== consumer.rate_limit_per_minute) payload.rate_limit_per_minute = r;

      if (consumer) {
        const nextCustomer = editStripeCustomer.trim() || null;
        const nextSubItem = editStripeSubItem.trim() || null;
        if (nextCustomer !== (consumer.stripe_customer_id ?? null)) {
          payload.stripe_customer_id = nextCustomer;
        }
        if (nextSubItem !== (consumer.stripe_subscription_item_id ?? null)) {
          payload.stripe_subscription_item_id = nextSubItem;
        }
      }

      if (Object.keys(payload).length === 0) {
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 1500);
        return;
      }

      const res = await fetch(`/api/admin/platform/passport-consumers/${consumerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "save_failed");
      setEditSaved(true);
      setTimeout(() => setEditSaved(false), 2000);
      await load();
    } catch {
      setErr("保存に失敗しました。入力内容をご確認ください。");
    } finally {
      setSavingEdit(false);
    }
  }

  async function issueKey() {
    if (!keyName.trim()) {
      setErr("キーの説明 (用途) を入力してください。");
      return;
    }
    setIssuing(true);
    setErr(null);
    setFreshlyIssued(null);
    try {
      const payload: Record<string, unknown> = {
        name: keyName.trim(),
        scopes: keyScopes,
      };
      // datetime-local の naive 文字列は JST 壁時計として解釈する。
      // ブラウザ TZ で解釈すると、UTC 環境の端末から発行した API キーの失効が 9 時間ずれる。
      const expiresIso = jstLocalInputToUtcIso(keyExpiresAt);
      if (expiresIso) payload.expires_at = expiresIso;
      const res = await fetch(`/api/admin/platform/passport-consumers/${consumerId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "issue_failed");
      setFreshlyIssued({ name: keyName.trim(), rawKey: j.key as string });
      setKeyName("");
      setKeyScopes(["passport:verify"]);
      setKeyExpiresAt("");
      await load();
    } catch {
      setErr("キー発行に失敗しました。");
    } finally {
      setIssuing(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm("このキーを失効しますか? 利用中のコール元は即座に 401 を受け取ります。")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/admin/platform/passport-consumers/${consumerId}/keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("revoke_failed");
      await load();
    } catch {
      setErr("失効に失敗しました。");
    }
  }

  if (loading) return <div className="text-sm text-muted">読み込み中...</div>;
  if (!consumer) return <div className="text-sm text-red-500">{err ?? "見つかりません。"}</div>;

  return (
    <div className="space-y-6">
      {err ? <div className="text-sm text-red-500">{err}</div> : null}

      {/* Edit consumer meta */}
      <section className="glass-card space-y-4 p-5">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">基本情報</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              STATUS_TONE[consumer.status] ?? "bg-zinc-100 text-zinc-700"
            }`}
          >
            {STATUS_LABEL[consumer.status] ?? consumer.status}
          </span>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-primary">事業者名</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input-field mt-2 w-full"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-primary">連絡先メール</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="input-field mt-2 w-full"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-primary">ステータス</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="input-field mt-2 w-full"
            >
              <option value="active">アクティブ</option>
              <option value="suspended">停止中 (新規キー利用も含め一律 401)</option>
              <option value="closed">解約済み</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-primary">月間クォータ</label>
              <input
                type="number"
                min={0}
                max={10000000}
                step={100}
                value={editQuota}
                onChange={(e) => setEditQuota(e.target.value)}
                className="input-field mt-2 w-full"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">レート (req/min)</label>
              <input
                type="number"
                min={1}
                max={10000}
                step={1}
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                className="input-field mt-2 w-full"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-100 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Stripe metered billing 連携
          </div>
          <p className="text-xs text-muted">
            両方を空にすると Stripe には報告せず内部集計のみになります (手動請求用)。両方を設定すると毎月 1 日の cron
            で前月分の usage record を <code>action=set</code> で送信します。
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-primary">Stripe Customer ID</label>
              <input
                type="text"
                value={editStripeCustomer}
                onChange={(e) => setEditStripeCustomer(e.target.value)}
                className="input-field mt-2 w-full font-mono"
                placeholder="cus_..."
                maxLength={120}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">Subscription Item ID (metered price)</label>
              <input
                type="text"
                value={editStripeSubItem}
                onChange={(e) => setEditStripeSubItem(e.target.value)}
                className="input-field mt-2 w-full font-mono"
                placeholder="si_..."
                maxLength={120}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveEdit}
            disabled={savingEdit}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {savingEdit ? "保存中..." : "保存する"}
          </button>
          {editSaved ? <span className="text-sm text-success">保存しました</span> : null}
          <span className="ml-auto text-xs text-muted">
            登録: {fmtDateTime(consumer.created_at)} / 更新: {fmtDateTime(consumer.updated_at)}
          </span>
        </div>
      </section>

      {/* 30-day stats */}
      <section className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">直近30日の利用状況</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-xs text-muted">合計コール</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {(stats?.call_count_30d ?? 0).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">エラー (4xx/5xx)</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-rose-600">
              {(stats?.error_count_30d ?? 0).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">月間クォータ</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{consumer.monthly_quota.toLocaleString("ja-JP")}</div>
          </div>
          <div>
            <div className="text-xs text-muted">最終コール</div>
            <div className="mt-1 text-sm">{fmtDateTime(stats?.last_call_at ?? null)}</div>
          </div>
        </div>

        {(stats?.endpoint_breakdown ?? []).length > 0 ? (
          <div className="mt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              エンドポイント内訳 (直近500件)
            </div>
            <ul className="space-y-1 text-sm">
              {stats!.endpoint_breakdown.map((e) => (
                <li key={e.endpoint} className="flex items-center justify-between gap-3 rounded bg-zinc-50 px-3 py-2">
                  <code className="text-xs">{e.endpoint}</code>
                  <span className="tabular-nums">{e.count.toLocaleString("ja-JP")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Issue new key */}
      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">API キーを発行</h2>

        {freshlyIssued ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              「{freshlyIssued.name}」を発行しました。次回以降この raw key は再表示できません。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="block flex-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-emerald-300">
                {freshlyIssued.rawKey}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(freshlyIssued.rawKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
              >
                {copied ? "コピー済" : "コピー"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFreshlyIssued(null)}
              className="mt-3 text-xs text-zinc-600 hover:underline"
            >
              閉じる (確認しました)
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-primary">キーの説明</label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="input-field mt-2 w-full"
              placeholder="例: 本番用 (CRM サーバ)"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-primary">有効期限 (任意)</label>
            <input
              type="datetime-local"
              value={keyExpiresAt}
              onChange={(e) => setKeyExpiresAt(e.target.value)}
              className="input-field mt-2 w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-primary">スコープ</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {KNOWN_SCOPES.map((s) => {
                const checked = keyScopes.includes(s);
                return (
                  <label
                    key={s}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${
                      checked ? "border-accent bg-accent/10" : "border-zinc-300 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mr-2 align-middle"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setKeyScopes((prev) => Array.from(new Set([...prev, s])));
                        else setKeyScopes((prev) => prev.filter((x) => x !== s));
                      }}
                    />
                    <code className="text-xs">{s}</code>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">
              <code>passport:verify</code> = /verify、<code>passport:marketplace</code> = /marketplace-info と
              /referrals/claim、<code>*</code> = 全許可。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={issueKey}
          disabled={issuing || keyScopes.length === 0}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {issuing ? "発行中..." : "キーを発行する"}
        </button>
      </section>

      {/* Existing keys */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">既存キー</h2>
        {keys.length === 0 ? (
          <div className="glass-card p-4 text-sm text-muted">まだキーが発行されていません。</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">プレフィックス / 説明</th>
                  <th className="px-4 py-3 text-left">スコープ</th>
                  <th className="px-4 py-3 text-left">最終利用</th>
                  <th className="px-4 py-3 text-left">期限</th>
                  <th className="px-4 py-3 text-left">ステータス</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs">{k.key_prefix}…</code>
                      <div className="text-xs text-zinc-500">{k.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <code key={s} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px]">
                            {s}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmtDateTime(k.last_used_at)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmtDateTime(k.expires_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_TONE[k.status] ?? "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {STATUS_LABEL[k.status] ?? k.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => revokeKey(k.id)}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          失効
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Raw call logs (on-demand fetch — heavy column, hide by default) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">直近のコール (最大 100 件)</h2>
          <button
            type="button"
            onClick={loadCalls}
            disabled={loadingCalls}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
          >
            {loadingCalls ? "読み込み中..." : callsLoadedOnce ? "再読込" : "読み込む"}
          </button>
        </div>
        {!callsLoadedOnce ? (
          <div className="glass-card p-4 text-sm text-muted">
            「読み込む」を押すと直近 100 件の生コールログを表示します (起動時には自動取得しません)。
          </div>
        ) : callLogs.length === 0 ? (
          <div className="glass-card p-4 text-sm text-muted">該当するコール履歴がありません。</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">時刻</th>
                  <th className="px-3 py-2 text-left">エンドポイント</th>
                  <th className="px-3 py-2 text-left">VIN</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-right">ms</th>
                  <th className="px-3 py-2 text-left">UA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {callLogs.map((c) => (
                  <tr key={String(c.id)} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-xs text-zinc-500">{fmtDateTime(c.called_at)}</td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-[11px]">{c.endpoint}</code>
                    </td>
                    <td className="px-3 py-2">
                      {c.vin_queried_normalized ? (
                        <code className="font-mono text-[11px]">…{c.vin_queried_normalized.slice(-6)}</code>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span
                        className={
                          c.response_status >= 500
                            ? "text-rose-600 font-semibold"
                            : c.response_status >= 400
                              ? "text-amber-700"
                              : "text-emerald-700"
                        }
                      >
                        {c.response_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                      {c.response_time_ms ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500" title={c.user_agent ?? ""}>
                      {c.user_agent ? (c.user_agent.length > 40 ? `${c.user_agent.slice(0, 40)}…` : c.user_agent) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Billing periods (Stripe metered billing audit trail) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">請求期間 (直近 12 ヶ月)</h2>
        {billingPeriods.length === 0 ? (
          <div className="glass-card p-4 text-sm text-muted">
            まだ集計済みの月はありません。毎月 1 日 17:00 UTC の cron で前月分が集計されます。
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">期間</th>
                  <th className="px-4 py-3 text-right">コール数</th>
                  <th className="px-4 py-3 text-left">Stripe 報告</th>
                  <th className="px-4 py-3 text-left">usage_record_id</th>
                  <th className="px-4 py-3 text-left">最終試行</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {billingPeriods.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      {p.period_start} 〜 {p.period_end}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.call_count.toLocaleString("ja-JP")}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.reported_to_stripe_at ? (
                        <span className="text-emerald-600">{fmtDateTime(p.reported_to_stripe_at)}</span>
                      ) : p.last_error ? (
                        <span className="text-rose-600" title={p.last_error}>
                          失敗
                        </span>
                      ) : (
                        <span className="text-zinc-500">未報告 (Stripe未連携)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.stripe_usage_record_id ? (
                        <code className="font-mono text-[10px] text-zinc-600">{p.stripe_usage_record_id}</code>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmtDateTime(p.last_attempt_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
