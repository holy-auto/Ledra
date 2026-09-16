"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { OPTIONAL_CAPABILITIES } from "@/lib/stripe/optionalCapabilities";

import { useTransition, useState, useCallback } from "react";
import HelpTooltip from "@/components/ui/HelpTooltip";
import MutationGuard from "@/components/ui/MutationGuard";
import { updateTenantSettingsAction } from "./actions";
import { CheckoutErrorPanel } from "@/components/billing/CheckoutErrorPanel";

type BankInfo = {
  bank_name?: string;
  branch_name?: string;
  account_type?: string;
  account_number?: string;
  account_holder?: string;
} | null;

type ConnectStatus = {
  accountId: string | null;
  onboarded: boolean;
} | null;

type Props = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  websiteUrl: string | null;
  registrationNumber: string | null;
  bankInfo: BankInfo;
  laborRatePerHour: number | null;
  bookingNotifySlackColumnExists: boolean;
  bookingNotifySlackConfigured: boolean;
  columnsExist: boolean;
  connectStatus?: ConnectStatus;
};

const inputCls = "input-field";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-secondary";

export default function SettingsForm({
  name,
  contactEmail,
  contactPhone,
  address,
  websiteUrl,
  registrationNumber,
  bankInfo,
  laborRatePerHour,
  bookingNotifySlackColumnExists,
  bookingNotifySlackConfigured,
  columnsExist,
  connectStatus,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateTenantSettingsAction(formData);
      if (res.ok) {
        setSuccess(true);
      } else {
        setError("error" in res ? res.error : "unknown");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className={labelCls}>
        <span className={labelTextCls}>
          店舗名 <span className="text-red-500">*</span>
        </span>
        <input
          name="name"
          defaultValue={name}
          required
          className={inputCls}
          placeholder="例: カーコーティング専門店 ○○"
        />
      </label>

      {columnsExist ? (
        <>
          <label className={labelCls}>
            <span className={labelTextCls}>メールアドレス</span>
            <input
              type="email"
              name="contact_email"
              defaultValue={contactEmail ?? ""}
              className={inputCls}
              placeholder="info@example.com"
            />
          </label>

          <label className={labelCls}>
            <span className={labelTextCls}>電話番号</span>
            <input
              type="tel"
              name="contact_phone"
              defaultValue={contactPhone ?? ""}
              className={inputCls}
              placeholder="03-0000-0000"
            />
          </label>

          <label className={labelCls}>
            <span className={labelTextCls}>住所</span>
            <input
              name="address"
              defaultValue={address ?? ""}
              className={inputCls}
              placeholder="東京都渋谷区○○ 1-2-3"
            />
          </label>

          <label className={labelCls}>
            <span className={labelTextCls}>Webサイト</span>
            <input
              type="url"
              name="website_url"
              defaultValue={websiteUrl ?? ""}
              className={inputCls}
              placeholder="https://example.com"
            />
          </label>

          <div className="border-t border-[var(--border-default)] pt-5 mt-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3 flex items-center gap-1.5">
              インボイス設定
              <HelpTooltip>
                適格請求書（インボイス）発行事業者の登録番号を設定すると、発行する請求書に自動表示されます。未登録の場合は空欄でOK。
              </HelpTooltip>
            </div>
            <label className={labelCls}>
              <span className={labelTextCls}>適格請求書発行事業者登録番号</span>
              <input
                name="registration_number"
                defaultValue={registrationNumber ?? ""}
                className={inputCls}
                placeholder="T1234567890123"
                pattern="T\d{13}"
                title="T + 13桁の数字（例: T1234567890123）"
              />
              <span className="text-xs text-muted">T + 13桁の数字を入力してください</span>
            </label>
          </div>

          <div className="border-t border-[var(--border-default)] pt-5 mt-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3 flex items-center gap-1.5">
              工賃設定
              <HelpTooltip>
                レバーレート（1時間あたりの工賃単価）を設定すると、品目マスタで標準工数（日整連の指数など）を持つ品目の提供価格が「工数×レバーレート」で自動算出されます。保存時に該当品目の価格を一括再計算します。
              </HelpTooltip>
            </div>
            <label className={labelCls}>
              <span className={labelTextCls}>レバーレート（円/時）</span>
              <input
                type="number"
                name="labor_rate_per_hour"
                defaultValue={laborRatePerHour ?? ""}
                min="0"
                step="1"
                className={inputCls}
                placeholder="例: 9000"
              />
              <span className="text-xs text-muted">未設定（空欄）の場合、工数からの工賃自動算出は行われません</span>
            </label>
          </div>

          <div className="border-t border-[var(--border-default)] pt-5 mt-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3 flex items-center gap-1.5">
              口座情報
              <HelpTooltip>
                請求書PDFの振込先欄に自動印字されます。複数口座は使い分けできないため、メインの入金口座を登録してください。
              </HelpTooltip>
            </div>
            <div className="space-y-4">
              <label className={labelCls}>
                <span className={labelTextCls}>銀行名</span>
                <input
                  name="bank_name"
                  defaultValue={bankInfo?.bank_name ?? ""}
                  className={inputCls}
                  placeholder="例: みずほ銀行"
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>支店名</span>
                <input
                  name="bank_branch_name"
                  defaultValue={bankInfo?.branch_name ?? ""}
                  className={inputCls}
                  placeholder="例: 渋谷支店"
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>口座種別</span>
                <select name="bank_account_type" defaultValue={bankInfo?.account_type ?? "普通"} className={inputCls}>
                  <option value="普通">普通</option>
                  <option value="当座">当座</option>
                </select>
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>口座番号</span>
                <input
                  name="bank_account_number"
                  defaultValue={bankInfo?.account_number ?? ""}
                  className={inputCls}
                  placeholder="例: 1234567"
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>口座名義</span>
                <input
                  name="bank_account_holder"
                  defaultValue={bankInfo?.account_holder ?? ""}
                  className={inputCls}
                  placeholder="例: カ）サンプルショウテン"
                />
              </label>
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-warning/30 bg-warning-dim px-3 py-2 text-xs text-warning">
          住所・連絡先はDBマイグレーション後に入力できます（上記のSQL実行後にページを再読み込み）
        </p>
      )}

      {bookingNotifySlackColumnExists && (
        <div className="border-t border-[var(--border-default)] pt-5 mt-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3 flex items-center gap-1.5">
            予約通知
            <HelpTooltip>
              お客様がWeb予約フォームやGoogleマップ予約・LINEから予約すると、店舗の管理者/オーナー宛にメールで自動通知します。加えてSlackの着信Webhook
              URLを設定すると、同じ内容をSlackにも通知します（未設定ならSlack通知はスキップ）。
            </HelpTooltip>
          </div>
          <p className="mb-3 text-xs text-secondary">
            Slackにログインして投稿先チャンネルを選ぶだけで連携できます（Webhook URLの発行は不要）。
            <a href="/admin/settings/connections" className="ml-1 text-accent underline">
              連携ページを開く →
            </a>
          </p>
          <label className={labelCls}>
            <span className={labelTextCls}>Slack Webhook URL（手動設定・任意）</span>
            <input
              type="url"
              name="booking_notify_slack_webhook_url"
              defaultValue=""
              className={inputCls}
              placeholder={
                bookingNotifySlackConfigured
                  ? "設定済み（変更する場合のみ新しいURLを入力）"
                  : "https://hooks.slack.com/services/..."
              }
            />
            <span className="text-xs text-muted">
              未設定でもメール通知（管理者/オーナー宛）は自動で送信されます。セキュリティのため設定済みのURLは再表示されません（空欄のまま保存すれば変更されません）。
            </span>
          </label>
          {bookingNotifySlackConfigured && (
            <label className="mt-2 flex items-center gap-2 text-xs text-secondary">
              <input type="checkbox" name="booking_notify_slack_webhook_url_clear" value="on" />
              Slack通知用のWebhook URLを削除する
            </label>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {success && (
        <div className="rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
          設定を保存しました。
        </div>
      )}

      {/* テナント設定は owner のみ（代表判断 2026-09-04）。この画面は settings:view
          （admin も持つ）で開けるので、admin にはフォームを見せたうえで保存だけ塞ぐ。
          押せば必ず失敗するボタンを見せない。 */}
      <MutationGuard
        minRole="owner"
        fallback={<p className="text-xs text-muted">設定を変更できるのは店舗オーナーのみです。</p>}
      >
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? "保存中…" : "設定を保存"}
        </button>
      </MutationGuard>

      {/* Stripe Connect Section */}
      {columnsExist && (
        <div className="border-t border-[var(--border-default)] pt-5 mt-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3 flex items-center gap-1.5">
            STRIPE CONNECT
            <HelpTooltip>
              顧客にオンライン決済リンクを送るための機能です。連携すると請求書から「決済リンクを作成」が利用でき、クレジットカード入金が自動で計上されます。連携には
              Stripe の本人確認手続きが必要です。
            </HelpTooltip>
          </div>
          <StripeConnectSection connectStatus={connectStatus ?? null} />
        </div>
      )}
    </form>
  );
}

function StripeConnectSection({ connectStatus }: { connectStatus: ConnectStatus }) {
  const [busy, setBusy] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<{
    connected: boolean;
    onboarded: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    account_id?: string | null;
  } | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect");
      const j = await parseJsonSafe(res);
      if (res.ok && j) setLiveStatus(j);
    } catch {}
  }, []);

  /**
   * Connect の接続と一緒に申請する決済手段。**既定は空**（Ledra からは強制しない）。
   * 申請するとその手段の審査に必要な入力がオンボーディングに増えるので、
   * 使う予定のあるものだけ選んでもらう。
   */
  const [wantedCapabilities, setWantedCapabilities] = useState<string[]>([]);

  const toggleCapability = (id: string) =>
    setWantedCapabilities((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleConnect = async () => {
    setBusy(true);
    setConnectErr(null);
    try {
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          return_url: window.location.href,
          refresh_url: window.location.href,
          // 選んだ決済手段だけ一緒に申請する。**既定は何も選ばない**
          capabilities: wantedCapabilities,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);

      // 選んだのに申請できなかった分を伝える。**黙って進むと「申請したのに
      // Stripe が何も聞いてこない」だけの状態になり、店側は気づけない**
      const requested: string[] = Array.isArray(j?.requested_capabilities) ? j.requested_capabilities : [];
      const missing = wantedCapabilities.filter((c) => !requested.includes(c));
      if (missing.length) {
        const labels = missing.map((id) => OPTIONAL_CAPABILITIES.find((c) => c.id === id)?.label ?? id).join(" / ");
        const reason = j?.account_existed
          ? "既に作成済みの Stripe アカウントには、後から一緒に申請できません。"
          : "この環境では申請を受け付けられませんでした。";
        alert(
          `${labels} は今回申請していません。\n${reason}\nStripe のダッシュボード（設定 → 決済手段）から申請してください。`,
        );
      }

      if (j?.onboarding_url) {
        window.location.href = j.onboarding_url;
      }
    } catch (e) {
      setConnectErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Stripe Connect アカウントを切断しますか？\n切断後も Stripe アカウント自体は残ります。")) return;
    setBusy(true);
    setConnectErr(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "DELETE" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setLiveStatus({ connected: false, onboarded: false, account_id: null });
    } catch (e) {
      setConnectErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const isOnboarded = liveStatus?.onboarded ?? connectStatus?.onboarded ?? false;
  const accountId = liveStatus?.account_id ?? connectStatus?.accountId;
  const isConnected = liveStatus?.connected ?? !!accountId;

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">Stripeアカウントを接続すると、オンライン決済を受け付けることができます。</p>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        {isOnboarded ? (
          <span className="inline-flex items-center gap-1.5 text-success font-medium">
            <span className="w-2 h-2 rounded-full bg-success" />
            接続済み
          </span>
        ) : isConnected ? (
          <span className="inline-flex items-center gap-1.5 text-warning font-medium">
            <span className="w-2 h-2 rounded-full bg-warning" />
            オンボーディング未完了
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
            未接続
          </span>
        )}
      </div>

      {isOnboarded && liveStatus && (
        <div className="text-sm text-secondary space-y-1">
          <div>
            課金受付: <b className="text-primary">{liveStatus.charges_enabled ? "有効" : "無効"}</b>
          </div>
          <div>
            入金: <b className="text-primary">{liveStatus.payouts_enabled ? "有効" : "無効"}</b>
          </div>
          {accountId && <div className="text-xs text-muted font-mono">ID: {accountId}</div>}
        </div>
      )}

      {connectErr && (
        <CheckoutErrorPanel
          error={connectErr}
          errorCode={null}
          attempt={1}
          isPending={busy}
          onRetry={handleConnect}
          supportHref="/admin/support"
        />
      )}

      {!isConnected && (
        <div className="rounded-lg border border-border-subtle p-3 space-y-2">
          <p className="text-sm font-medium text-primary">一緒に申請する決済手段（任意）</p>
          <p className="text-xs text-secondary">
            選ぶと、その手段の審査に必要な入力も Stripe のオンボーディングでまとめて済ませられます。
            <b>選ばなくても接続できます。</b>後から Stripe のダッシュボードでいつでも申請できます。
          </p>
          <div className="flex flex-col gap-1.5">
            {OPTIONAL_CAPABILITIES.map((cap) => (
              <label key={cap.id} className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={wantedCapabilities.includes(cap.id)}
                  onChange={() => toggleCapability(cap.id)}
                />
                <span className="text-primary">{cap.label}</span>
                <span className="text-xs text-muted">{cap.note}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        {!isOnboarded && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={handleConnect}>
            {busy ? "処理中…" : isConnected ? "オンボーディングを再開" : "Stripeアカウントを接続"}
          </button>
        )}
        {isConnected && (
          <button type="button" className="btn-ghost text-sm" onClick={checkStatus}>
            ステータスを更新
          </button>
        )}
        {isConnected && (
          <button
            type="button"
            className="text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-1.5"
            disabled={busy}
            onClick={handleDisconnect}
          >
            切断する
          </button>
        )}
      </div>

      {isOnboarded && (
        <div className="mt-3 rounded-lg bg-success-dim border border-success/30 p-3">
          <p className="text-sm text-success">
            請求書の詳細画面から「決済リンクを作成」ボタンで、顧客にオンライン決済リンクを送信できます。
          </p>
        </div>
      )}
    </div>
  );
}
