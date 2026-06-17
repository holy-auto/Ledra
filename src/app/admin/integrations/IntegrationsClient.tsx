"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { API_KEY_SCOPES, API_KEY_SCOPE_LABELS, type ApiKeyScope } from "@/lib/api-key-scopes";
import { WEBHOOK_TOPICS, WEBHOOK_TOPIC_LABELS } from "@/lib/webhook-topics";

// ─────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────
interface ApiKey {
  id: string;
  prefix: string;
  description: string | null;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: "active" | "revoked" | "expired";
}

interface Webhook {
  id: string;
  url: string;
  topics: string[];
  description: string | null;
  is_active: boolean;
  secret: string;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_error: string | null;
  created_at: string;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
export default function IntegrationsClient() {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="INTEGRATIONS"
        title="API連携"
        description="基幹ソフト (車検・整備・販売管理) と Ledra を連携する APIキーと Webhook を管理します。"
      />

      <ApiKeysSection onToast={showToast} />
      <WebhooksSection onToast={showToast} />

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// APIキー
// ─────────────────────────────────────────────────────────────
function ApiKeysSection({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["customers:write", "vehicles:write", "work_history:write"]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/api-keys", { cache: "no-store" });
    const json = await parseJsonSafe<{ keys?: ApiKey[] }>(res);
    setKeys(json?.keys ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleScope(s: ApiKeyScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function create() {
    if (scopes.length === 0) {
      onToast("スコープを1つ以上選択してください。", "err");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/integrations/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: description || undefined, scopes }),
      });
      const json = await parseJsonSafe<{ key?: string }>(res);
      if (!res.ok || !json?.key) {
        onToast("APIキーの発行に失敗しました。", "err");
        return;
      }
      setNewKey(json.key);
      setShowForm(false);
      setDescription("");
      setScopes(["customers:write", "vehicles:write", "work_history:write"]);
      void load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("このAPIキーを失効しますか？この操作は取り消せません。")) return;
    const res = await fetch(`/api/admin/integrations/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      onToast("APIキーを失効しました。");
      void load();
    } else {
      onToast("失効に失敗しました。", "err");
    }
  }

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">APIキー</h2>
          <p className="text-sm text-secondary">
            基幹ソフトが <code className="text-xs">Authorization: Bearer lk_live_…</code> で取込APIを叩くための鍵。
          </p>
        </div>
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "閉じる" : "＋ 新規発行"}
        </button>
      </div>

      {newKey && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">APIキーを発行しました（この画面でのみ表示されます）</p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs">{newKey}</code>
          <div className="mt-2 flex gap-2">
            <button
              className="btn-secondary px-3 py-1 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(newKey);
                onToast("コピーしました。");
              }}
            >
              コピー
            </button>
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setNewKey(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-default p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted">説明（任意）</label>
            <input
              className="input-field mt-1 w-full"
              placeholder="例: Broadleaf 連携"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">スコープ</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {API_KEY_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                  <span>{API_KEY_SCOPE_LABELS[s]}</span>
                  <code className="text-[11px] text-muted">{s}</code>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={creating} onClick={create}>
            {creating ? "発行中…" : "発行する"}
          </button>
        </div>
      )}

      <KeyTable keys={keys} onRevoke={revoke} />
    </section>
  );
}

function KeyTable({ keys, onRevoke }: { keys: ApiKey[] | null; onRevoke: (id: string) => void }) {
  if (keys === null) return <p className="text-sm text-muted">読み込み中…</p>;
  if (keys.length === 0) return <p className="text-sm text-muted">APIキーはまだありません。</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-hover text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2">キー</th>
            <th className="px-3 py-2">説明</th>
            <th className="px-3 py-2">スコープ</th>
            <th className="px-3 py-2">状態</th>
            <th className="px-3 py-2">最終使用</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-t border-default">
              <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
              <td className="px-3 py-2">{k.description ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="text-[11px] text-muted">{k.scopes.join(", ")}</span>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={k.status} />
              </td>
              <td className="px-3 py-2 text-xs text-muted">{fmtDate(k.last_used_at)}</td>
              <td className="px-3 py-2 text-right">
                {k.status === "active" && (
                  <button className="btn-ghost px-3 py-1 text-xs text-danger" onClick={() => onRevoke(k.id)}>
                    失効
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    revoked: "bg-red-100 text-red-800",
    expired: "bg-gray-200 text-gray-700",
  };
  const label: Record<string, string> = { active: "有効", revoked: "失効", expired: "期限切れ" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {label[status] ?? status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Webhook
// ─────────────────────────────────────────────────────────────
function WebhooksSection({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState<string[]>(["*"]);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/webhooks", { cache: "no-store" });
    const json = await parseJsonSafe<{ webhooks?: Webhook[] }>(res);
    setHooks(json?.webhooks ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleTopic(t: string) {
    setTopics((prev) => {
      if (t === "*") return ["*"];
      const without = prev.filter((x) => x !== "*");
      return without.includes(t) ? without.filter((x) => x !== t) : [...without, t];
    });
  }

  async function create() {
    if (!url.startsWith("https://")) {
      onToast("URL は https:// で始まる必要があります。", "err");
      return;
    }
    if (topics.length === 0) {
      onToast("トピックを1つ以上選択してください。", "err");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/integrations/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, topics, description: description || undefined }),
      });
      const json = await parseJsonSafe<{ webhook?: { secret?: string } }>(res);
      if (!res.ok || !json?.webhook?.secret) {
        onToast("Webhook の作成に失敗しました。", "err");
        return;
      }
      setNewSecret(json.webhook.secret);
      setShowForm(false);
      setUrl("");
      setDescription("");
      setTopics(["*"]);
      void load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(h: Webhook) {
    const res = await fetch(`/api/admin/integrations/webhooks/${h.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: !h.is_active }),
    });
    if (res.ok) {
      onToast(h.is_active ? "停止しました。" : "有効化しました。");
      void load();
    } else {
      onToast("更新に失敗しました。", "err");
    }
  }

  async function remove(id: string) {
    if (!confirm("この Webhook を削除しますか？")) return;
    const res = await fetch(`/api/admin/integrations/webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      onToast("削除しました。");
      void load();
    } else {
      onToast("削除に失敗しました。", "err");
    }
  }

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">Webhook（双方向同期）</h2>
          <p className="text-sm text-secondary">
            Ledra 側の変更 (顧客・車両・作業履歴・証明書) を自社システムへ HMAC 署名付きで通知します。
          </p>
        </div>
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "閉じる" : "＋ 新規登録"}
        </button>
      </div>

      {newSecret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">署名シークレット（この画面でのみ表示されます）</p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs">{newSecret}</code>
          <div className="mt-2 flex gap-2">
            <button
              className="btn-secondary px-3 py-1 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(newSecret);
                onToast("コピーしました。");
              }}
            >
              コピー
            </button>
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setNewSecret(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-default p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted">配信先 URL（https）</label>
            <input
              className="input-field mt-1 w-full"
              placeholder="https://example.com/webhooks/ledra"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">説明（任意）</label>
            <input
              className="input-field mt-1 w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">購読トピック</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={topics.includes("*")} onChange={() => toggleTopic("*")} />
                <span>すべて</span>
                <code className="text-[11px] text-muted">*</code>
              </label>
              {WEBHOOK_TOPICS.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={topics.includes(t)}
                    disabled={topics.includes("*")}
                    onChange={() => toggleTopic(t)}
                  />
                  <span>{WEBHOOK_TOPIC_LABELS[t]}</span>
                  <code className="text-[11px] text-muted">{t}</code>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={creating} onClick={create}>
            {creating ? "作成中…" : "作成する"}
          </button>
        </div>
      )}

      {hooks === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : hooks.length === 0 ? (
        <p className="text-sm text-muted">Webhook はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">トピック</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">最終配信</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} className="border-t border-default">
                  <td className="px-3 py-2 max-w-[280px] truncate font-mono text-xs">{h.url}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{h.topics.join(", ")}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        h.is_active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {h.is_active ? "有効" : "停止"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {fmtDate(h.last_delivery_at)}
                    {h.last_delivery_status === "errored" && <span className="ml-1 text-danger">⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggleActive(h)}>
                      {h.is_active ? "停止" : "有効化"}
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => remove(h.id)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
