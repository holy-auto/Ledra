import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import PageHeader from "@/components/ui/PageHeader";
import HelpTooltip from "@/components/ui/HelpTooltip";
import type { SquareConnection } from "@/types/square";
import { INTEGRATION_CATALOG, CATALOG_SECTIONS } from "@/lib/integrations/catalog";
import { listConnections } from "@/lib/integrations/store";
import { getOAuthProvider, isProviderConfigured } from "@/lib/integrations/registry";
import SquareConnectSection from "../SquareConnectSection";
import LineConnectSection from "../LineConnectSection";
import EmailInboundSection from "../EmailInboundSection";
import NexPTGConnectSection from "../NexPTGConnectSection";
import SlackConnectSection from "./SlackConnectSection";

export const dynamic = "force-dynamic";

/** 連携ページに出す 1 行あたりの見え方 */
type Row = { connected: boolean; detail?: string };

const ERROR_LABELS: Record<string, string> = {
  denied: "連携が許可されませんでした。もう一度お試しください。",
  missing_params: "連携に必要な情報が返りませんでした。もう一度お試しください。",
  invalid_state: "連携リンクの有効期限が切れています。もう一度お試しください。",
  unauthenticated: "セッションが切れています。再ログインしてからお試しください。",
  unauthorized: "この店舗の連携権限がありません。",
  not_configured: "運営側の設定が未完了です。サポートへご連絡ください。",
  exchange_failed: "連携先との通信に失敗しました。時間をおいてお試しください。",
  db_save: "連携情報の保存に失敗しました。もう一度お試しください。",
  unknown_provider: "不明な連携先です。",
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; e?: string; provider?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/settings/connections");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership?.tenant_id) {
    return <div className="text-sm text-muted">tenant が見つかりません。</div>;
  }
  const tenantId = membership.tenant_id as string;
  const { admin } = createTenantScopedAdmin(tenantId);

  // 連携状態は tenants の各列 + 個別テーブルに散っているため、ここで 1 度だけ束ねる。
  const [tenantRes, squareRes, accountingRes, generic] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "line_enabled, email_inbound_enabled, gcal_refresh_token, gcal_sync_enabled, stripe_connect_onboarded, booking_notify_slack_webhook_ciphertext",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("square_connections")
      .select("id, tenant_id, square_merchant_id, status, connected_at, last_synced_at, square_location_ids")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin.from("accounting_integrations").select("provider, status, external_company_name").eq("tenant_id", tenantId),
    listConnections(tenantId),
  ]);

  const t = (tenantRes.data ?? null) as Record<string, unknown> | null;
  const statusLoadFailed = !!tenantRes.error;

  const squareRow = squareRes.data as Record<string, unknown> | null;
  const initialSquareConnection: SquareConnection | null = squareRow
    ? {
        id: squareRow.id as string,
        tenant_id: squareRow.tenant_id as string,
        square_merchant_id: (squareRow.square_merchant_id as string | null) ?? "",
        status: (squareRow.status as SquareConnection["status"]) ?? "disconnected",
        connected_at: (squareRow.connected_at as string | null) ?? null,
        last_synced_at: (squareRow.last_synced_at as string | null) ?? null,
        square_location_ids: (squareRow.square_location_ids as string[] | null) ?? [],
      }
    : null;

  const accounting = Object.fromEntries(
    ((accountingRes.data ?? []) as { provider: string; status: string; external_company_name: string | null }[]).map(
      (r) => [r.provider, r],
    ),
  );

  const slackRow = generic.slack ?? null;
  const slackChannel = typeof slackRow?.metadata?.channel === "string" ? slackRow.metadata.channel : null;
  // 真の接続状態は「通知が実際に飛ぶか」＝ webhook 列が入っているか。
  // 手入力フォームで設定/解除した場合も必ずこちらが正になる。
  const slackConfigured = !!t?.booking_notify_slack_webhook_ciphertext;
  const slackProviderSpec = getOAuthProvider("slack");
  const slackAvailable = !!slackProviderSpec && isProviderConfigured(slackProviderSpec);

  const rows: Record<string, Row> = {
    slack: { connected: slackConfigured, detail: slackRow?.external_account_name ?? undefined },
    line: { connected: !!t?.line_enabled },
    email_inbound: { connected: !!t?.email_inbound_enabled },
    gcal: { connected: !!t?.gcal_refresh_token && !!t?.gcal_sync_enabled },
    freee: {
      connected: accounting.freee?.status === "active",
      detail: accounting.freee?.external_company_name ?? undefined,
    },
    moneyforward: {
      connected: accounting.moneyforward?.status === "active",
      detail: accounting.moneyforward?.external_company_name ?? undefined,
    },
    stripe: { connected: !!t?.stripe_connect_onboarded },
    square: { connected: initialSquareConnection?.status === "active" },
    nexptg: { connected: false, detail: "下のセクションで確認" },
  };

  const connectedCount = INTEGRATION_CATALOG.filter((e) => rows[e.id]?.connected).length;
  const manualCount = INTEGRATION_CATALOG.filter((e) => !e.loginOnly).length;

  const errorKey = sp.e;
  const connectedProvider = sp.connected;

  return (
    <div className="space-y-6">
      <PageHeader
        tag="連携"
        title="外部サービス連携"
        description="各サービスに自分のアカウントでログインするだけで連携できます。連携の状態もここでまとめて確認できます。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            店舗設定へ戻る
          </Link>
        }
      />

      {connectedProvider && (
        <div className="rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
          {INTEGRATION_CATALOG.find((e) => e.id === connectedProvider)?.label ?? connectedProvider}
          との連携が完了しました。
        </div>
      )}
      {errorKey && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          連携に失敗しました: {ERROR_LABELS[errorKey] ?? errorKey}
        </div>
      )}
      {statusLoadFailed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-secondary">
          連携状態の取得に失敗しました。下の一覧は「未連携」に見えていても実際は連携中の場合があります。再読み込みしてください。
        </div>
      )}

      {/* 状態の総覧 */}
      <section className="glass-card space-y-5 p-5">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">連携状況</div>
          <div className="mt-1 text-base font-semibold text-primary">
            {connectedCount} / {INTEGRATION_CATALOG.length} 件が連携中
          </div>
          <p className="mt-1 text-xs text-muted">
            「ログインのみ」の連携は、連携先で ID
            やトークンを発行する作業が要りません。ボタンから自社アカウントでログインするだけで完了します。
            {manualCount > 0 && `（現在 ${manualCount} 件だけ発行作業が残っています）`}
          </p>
        </div>

        {CATALOG_SECTIONS.map((section) => {
          const items = INTEGRATION_CATALOG.filter((e) => e.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{section}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((entry) => {
                  const row = rows[entry.id] ?? { connected: false };
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle px-3 py-2.5"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          row.connected ? "bg-success" : "bg-[var(--text-muted)]"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-primary">{entry.label}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              entry.loginOnly ? "bg-success-dim text-success" : "bg-amber-500/10 text-amber-500"
                            }`}
                          >
                            {entry.loginOnly ? "ログインのみ" : "発行作業あり"}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {row.connected ? (row.detail ? `連携中 — ${row.detail}` : "連携中") : entry.summary}
                        </span>
                        {entry.href && (
                          <Link href={entry.href} className="mt-1 inline-block text-[11px] text-accent underline">
                            設定を開く →
                          </Link>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Slack連携 */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">通知</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
            Slack連携
            <HelpTooltip>
              予約が入ったときにSlackの指定チャンネルへ自動投稿します。Slackにログインして投稿先を選ぶだけで連携でき、Webhook
              URLを自分で発行する必要はありません。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">新しい予約をSlackのチャンネルへ自動でお知らせします。</p>
        </div>
        <SlackConnectSection
          configured={slackConfigured}
          workspaceName={slackRow?.external_account_name ?? null}
          channel={slackChannel}
          available={slackAvailable}
        />
      </section>

      {/* Square連携 */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">POS</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
            Square連携
            <HelpTooltip>
              既に Square で POS 会計を運用している施工店向けの連携です。OAuth で接続すると、Square
              側の注文データが自動で Ledra に取り込まれ、経営分析・売上突合に使えます。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">SquareのPOS売上データをLedraに取り込みます。</p>
        </div>
        <SquareConnectSection initialConnection={initialSquareConnection} />
      </section>

      {/* LINE連携 */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">通知</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
            LINE連携
            <HelpTooltip>
              LINE 公式アカウントと連携すると、予約確認・施工完了通知・証明書共有を LINE
              で自動配信できます。顧客とのコミュニケーション接点を増やしリピート率向上に寄与します。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">
            LINE公式アカウントと連携し、予約通知・リマインダー・書類送付を自動化します。
          </p>
        </div>
        <LineConnectSection />
      </section>

      {/* メール予約取り込み */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">予約</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
            メール予約取り込み
            <HelpTooltip>
              予約メールを専用アドレスへ自動転送すると、AI が日程・車両・内容を読み取り、確認付きで予約・ Google
              カレンダーに取り込みます。LINE と同じ抽出・複合認識の仕組みを使います。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">
            予約メールを専用アドレスへ自動転送するだけで、AIが予約内容を読み取りカレンダーに取り込みます。
          </p>
        </div>
        <EmailInboundSection />
      </section>

      {/* NexPTG（膜厚計）連携 */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">計測機器</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
            NexPTG（膜厚計）連携
            <HelpTooltip>
              NexPTG は塗装の膜厚を測る計測機 + アプリです。Ledra に API
              キーを設定しておくと、アプリで測定した膜厚データが自動的に Ledra
              の証明書「膜厚計測」セクションに同期されます。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">
            NexPTGアプリで測定した膜厚データをLedraへ自動同期します。APIキーを発行してアプリに設定してください。
          </p>
        </div>
        <NexPTGConnectSection />
      </section>
    </div>
  );
}
