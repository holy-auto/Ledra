"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

type Tab = "info" | "users" | "plan" | "audit";

export default function InsurerAccountPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [insurer, setInsurer] = useState<any>(null);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
      try {
        const res = await fetch("/api/insurer/account");
        if (res.ok) {
          const j = await res.json();
          setInsurer(j.insurer);
          setUserCount(j.user_count);
        }
      } catch {}
    })();
  }, [supabase]);

  if (!ready) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "会社情報" },
    { key: "users", label: "ユーザー" },
    { key: "plan", label: "プラン" },
    { key: "audit", label: "監査ログ" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
          ACCOUNT
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">アカウント設定</h1>
      </header>

      <div className="flex gap-1 rounded-xl bg-surface-hover p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && insurer && <CompanyInfoTab insurer={insurer} />}
      {tab === "users" && <UsersTab insurer={insurer} userCount={userCount} />}
      {tab === "plan" && insurer && <PlanTab insurer={insurer} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function CompanyInfoTab({ insurer }: { insurer: any }) {
  return (
    <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-muted">COMPANY INFO</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="会社名" value={insurer.name} />
        <InfoItem label="ステータス" value={insurer.status === "active" ? "有効" : insurer.status} />
        <InfoItem label="メールアドレス" value={insurer.contact_email || "-"} />
        <InfoItem label="電話番号" value={insurer.contact_phone || "-"} />
        <InfoItem label="住所" value={insurer.address || "-"} />
        <InfoItem label="登録日" value={formatDateTime(insurer.created_at)} />
      </div>
    </section>
  );
}

function UsersTab({ insurer, userCount }: { insurer: any; userCount: number }) {
  return (
    <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-muted">USERS</div>
      <div className="text-sm text-secondary">
        現在 <span className="font-bold text-primary">{userCount}</span> / {insurer?.max_users ?? "-"} ユーザー
      </div>
      <p className="mt-4 text-sm text-muted">
        ユーザー管理は今後のアップデートで強化されます。現在はダッシュボードからユーザーの招待が可能です。
      </p>
    </section>
  );
}

function PlanTab({ insurer }: { insurer: any }) {
  const planLabels: Record<string, string> = {
    basic: "ベーシック",
    pro: "プロ",
    enterprise: "エンタープライズ",
  };

  return (
    <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-muted">PLAN</div>
      <div className="text-lg font-bold text-primary">{planLabels[insurer.plan_tier] ?? insurer.plan_tier}</div>
      <div className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600">&#10003;</span> 証明書検索・閲覧
        </div>
        <div className="flex items-center gap-2">
          <span className={insurer.plan_tier !== "basic" ? "text-emerald-600" : "text-muted"}>
            {insurer.plan_tier !== "basic" ? "\u2713" : "\u2014"}
          </span>{" "}
          CSV / PDF エクスポート
        </div>
        <div className="flex items-center gap-2">
          <span className={insurer.plan_tier === "enterprise" ? "text-emerald-600" : "text-muted"}>
            {insurer.plan_tier === "enterprise" ? "\u2713" : "\u2014"}
          </span>{" "}
          API アクセス
        </div>
      </div>
    </section>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/insurer/audit-logs?limit=50");
        if (res.ok) {
          const j = await res.json();
          setLogs(j.logs ?? []);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actionLabels: Record<string, string> = {
    search: "検索",
    view: "閲覧",
    vehicle_search: "車両検索",
    vehicle_view: "車両閲覧",
    download_pdf: "PDF DL",
    export_csv: "CSV出力",
    pii_disclosure_request: "PII開示申請",
  };

  return (
    <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-muted">AUDIT LOG</div>
      {loading ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-muted">監査ログがありません。</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="min-w-full text-sm">
            <thead className="bg-inset">
              <tr>
                <th className="p-3 text-left font-semibold text-secondary">日時</th>
                <th className="p-3 text-left font-semibold text-secondary">操作</th>
                <th className="p-3 text-left font-semibold text-secondary">詳細</th>
                <th className="p-3 text-left font-semibold text-secondary">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-secondary">{formatDateTime(l.created_at)}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-secondary">
                      {actionLabels[l.action] ?? l.action}
                    </span>
                  </td>
                  <td className="max-w-xs truncate p-3 font-mono text-xs text-muted">{JSON.stringify(l.meta ?? {})}</td>
                  <td className="p-3 text-xs text-muted">{l.ip ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-primary">{value}</div>
    </div>
  );
}
