"use client";

import { useTransition, useState } from "react";
import { updateTenantSettingsAction } from "./actions";

type Props = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  websiteUrl: string | null;
  columnsExist: boolean;
};

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";

export default function SettingsForm({ name, contactEmail, contactPhone, address, websiteUrl, columnsExist }: Props) {
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
        className="rounded-xl border border-neutral-900 bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "保存中…" : "設定を保存"}
      </button>
    </form>
  );
}
