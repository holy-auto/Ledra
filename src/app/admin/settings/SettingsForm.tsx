"use client";

import { useTransition, useState, useCallback } from "react";
import { updateTenantSettingsAction } from "./actions";

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
  columnsExist: boolean;
  connectStatus?: ConnectStatus;
};

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";

export default function SettingsForm({ name, contactEmail, contactPhone, address, websiteUrl, registrationNumber, bankInfo, columnsExist, connectStatus }: Props) {
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
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className={labelCls}>
        <span className={labelTextCls}>店舗名 <span className="text-red-500">*</span></span>
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

          <div className="border-t border-neutral-200 pt-5 mt-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-3">インボイス設定</div>
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
              <span className="text-xs text-neutral-500">T + 13桁の数字を入力してください</span>
            </label>
          </div>

          <div className="border-t border-neutral-200 pt-5 mt-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-3">口座情報</div>
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
                <select
                  name="bank_account_type"
                  defaultValue={bankInfo?.account_type ?? "普通"}
                  className={inputCls}
                >
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
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          住所・連絡先はDBマイグレーション後に入力できます（上記のSQL実行後にページを再読み込み）
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          設定を保存しました。
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        {isPending ? "保存中…" : "設定を保存"}
      </button>

      {/* Stripe Connect Section */}
      {columnsExist && (
        <div className="border-t border-neutral-200 pt-5 mt-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-3">STRIPE CONNECT</div>
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
      const j = await res.json().catch(() => null);
      if (res.ok && j) setLiveStatus(j);
    } catch {}
  }, []);

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
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      if (j?.onboarding_url) {
        window.location.href = j.onboarding_url;
      }
    } catch (e: any) {
      setConnectErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const isOnboarded = liveStatus?.onboarded ?? connectStatus?.onboarded ?? false;
  const accountId = liveStatus?.account_id ?? connectStatus?.accountId;
  const isConnected = liveStatus?.connected ?? !!accountId;

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Stripeアカウントを接続すると、オンライン決済を受け付けることができます。
      </p>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-500">ステータス:</span>
        {isOnboarded ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            接続済み
          </span>
        ) : isConnected ? (
          <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            オンボーディング未完了
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-neutral-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-neutral-400" />
            未接続
          </span>
        )}
      </div>

      {isOnboarded && liveStatus && (
        <div className="text-sm text-neutral-600 space-y-1">
          <div>課金受付: <b className="text-neutral-900">{liveStatus.charges_enabled ? "有効" : "無効"}</b></div>
          <div>入金: <b className="text-neutral-900">{liveStatus.payouts_enabled ? "有効" : "無効"}</b></div>
          {accountId && <div className="text-xs text-neutral-400 font-mono">ID: {accountId}</div>}
        </div>
      )}

      {connectErr && (
        <div className="text-sm text-red-500">{connectErr}</div>
      )}

      <div className="flex gap-3">
        {!isOnboarded && (
          <button
            type="button"
            className="btn-primary !text-sm"
            disabled={busy}
            onClick={handleConnect}
          >
            {busy ? "処理中…" : isConnected ? "オンボーディングを再開" : "Stripeアカウントを接続"}
          </button>
        )}
        {isConnected && (
          <button
            type="button"
            className="btn-ghost !text-sm"
            onClick={checkStatus}
          >
            ステータスを更新
          </button>
        )}
      </div>
    </div>
  );
}
