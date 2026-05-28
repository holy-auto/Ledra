"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ConsumerListItem = {
  id: string;
  name: string;
  contact_email: string;
  status: "active" | "suspended" | "closed" | string;
  monthly_quota: number;
  rate_limit_per_minute: number;
  active_key_count: number;
  call_count_30d: number;
  last_used_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: "アクティブ",
  suspended: "停止中",
  closed: "解約済み",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-800",
  closed: "bg-zinc-200 text-zinc-600",
};

function fmtDateTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("ja-JP");
}

export default function PassportConsumersClient() {
  const [consumers, setConsumers] = useState<ConsumerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [quota, setQuota] = useState("1000");
  const [rateLimit, setRateLimit] = useState("60");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/platform/passport-consumers", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "load_failed");
      setConsumers((j?.consumers ?? []) as ConsumerListItem[]);
    } catch {
      setErr("一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitCreate() {
    if (!name.trim() || !contactEmail.trim()) {
      setErr("事業者名と連絡先メールは必須です。");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/platform/passport-consumers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact_email: contactEmail.trim(),
          monthly_quota: Number(quota),
          rate_limit_per_minute: Number(rateLimit),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "create_failed");
      setName("");
      setContactEmail("");
      setQuota("1000");
      setRateLimit("60");
      setShowCreate(false);
      await load();
    } catch {
      setErr("作成に失敗しました。入力内容をご確認ください。");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          ステータス・クォータの変更は各事業者をクリック。API キーの発行と失効も詳細画面から行えます。
        </p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          {showCreate ? "キャンセル" : "+ 新規事業者を追加"}
        </button>
      </div>

      {showCreate ? (
        <div className="glass-card space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-primary">事業者名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field mt-2 w-full"
                placeholder="例: 〇〇カーズ株式会社"
                maxLength={120}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">連絡先メール</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="input-field mt-2 w-full"
                placeholder="ops@example.com"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">月間クォータ (回)</label>
              <input
                type="number"
                min={0}
                max={10000000}
                step={100}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                className="input-field mt-2 w-40"
              />
              <p className="mt-1 text-xs text-muted">超過時は 429 plan_limit を返してハード遮断します。0 = 無制限。</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">秒間レート上限 (req/min)</label>
              <input
                type="number"
                min={1}
                max={10000}
                step={1}
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                className="input-field mt-2 w-40"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={submitCreate}
            disabled={creating}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {creating ? "作成中..." : "作成する"}
          </button>
        </div>
      ) : null}

      {err ? <div className="text-sm text-red-500">{err}</div> : null}

      {loading ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : consumers.length === 0 ? (
        <div className="glass-card p-5 text-sm text-muted">
          まだコンシューマは登録されていません。「+ 新規事業者を追加」から作成してください。
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">事業者</th>
                <th className="px-4 py-3 text-left">ステータス</th>
                <th className="px-4 py-3 text-right">有効キー</th>
                <th className="px-4 py-3 text-right">直近30日</th>
                <th className="px-4 py-3 text-left">最終利用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {consumers.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/platform/passport-consumers/${c.id}`}
                      className="block font-medium text-blue-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{c.contact_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_TONE[c.status] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.active_key_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.call_count_30d.toLocaleString("ja-JP")}
                    <div className="text-[10px] text-zinc-400">
                      / クォータ {c.monthly_quota.toLocaleString("ja-JP")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmtDateTime(c.last_used_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
