import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTransferByToken } from "@/lib/passport/transfers/respond";
import { isTransferTokenFormat } from "@/lib/passport/transfers/tokens";
import TransferActions from "./TransferActions";

export const dynamic = "force-dynamic";

// This page is reachable only by recipients who hold the
// token-bearing email link. Keep it out of search indexes
// regardless of robots.txt.
export const metadata: Metadata = {
  title: "車両パスポート所有権移転 — Ledra",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "受諾待ち",
  accepted: "受諾済み",
  rejected: "辞退済み",
  cancelled: "キャンセル済み",
  expired: "期限切れ",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-zinc-200 text-zinc-700",
  cancelled: "bg-zinc-200 text-zinc-700",
  expired: "bg-rose-100 text-rose-700",
};

export default async function PassportTransferPage({ params }: PageProps) {
  const { token } = await params;
  if (!isTransferTokenFormat(token)) notFound();

  const view = await getTransferByToken(token);
  if (!view) notFound();

  const expiryDisplay = new Date(view.expires_at).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8 text-zinc-900">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Ledra Vehicle Passport</p>
        <h1 className="text-2xl font-bold">車両パスポート所有権移転</h1>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <dl className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">ステータス</dt>
            <dd>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  STATUS_TONE[view.status] ?? "bg-zinc-200 text-zinc-700"
                }`}
              >
                {STATUS_LABEL[view.status] ?? view.status}
              </span>
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">対象車両</dt>
            <dd className="text-right font-medium">{view.vehicle_label ?? "—"}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">パスポートID</dt>
            <dd className="font-mono text-right">{view.vin_short}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">送信元</dt>
            <dd className="text-right">{view.shop_name ?? "—"}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">移転先メール</dt>
            <dd className="break-all text-right">{view.to_owner_email}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-zinc-500">有効期限</dt>
            <dd className="text-right">{expiryDisplay}</dd>
          </div>
        </dl>

        {view.message ? (
          <div className="mt-6 rounded-lg bg-zinc-50 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">メッセージ</p>
            <p className="whitespace-pre-wrap text-zinc-700">{view.message}</p>
          </div>
        ) : null}
      </section>

      {view.status === "pending" ? (
        <TransferActions
          token={token}
          presetName={view.to_owner_name}
          recipientEmail={view.to_owner_email}
          vehicleLabel={view.vehicle_label}
        />
      ) : (
        <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
          {view.status === "accepted" &&
            "このリクエストは既に受諾されています。今後の通知は新しいオーナー様宛てに送信されます。"}
          {view.status === "rejected" && "このリクエストは辞退されました。"}
          {view.status === "cancelled" && "このリクエストは送信元によりキャンセルされました。"}
          {view.status === "expired" && "このリクエストは有効期限を過ぎています。送信元に再発行を依頼してください。"}
        </section>
      )}

      <footer className="mt-auto text-xs text-zinc-400">
        身に覚えのないリクエストは無視してください。本ページは Ledra の車両パスポート機能の一部です。
      </footer>
    </main>
  );
}
