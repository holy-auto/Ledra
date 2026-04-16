import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import SecurityClient from "./SecurityClient";

/**
 * セキュリティ設定 `/admin/settings/security`
 * ------------------------------------------------------------
 * 2 要素認証 (TOTP) の有効化・無効化。
 *
 * Supabase Auth の MFA API (enroll/challenge/verify/unenroll) を
 * ブラウザ側で直接叩く。サーバーコンポーネント側では
 * 現在のユーザーと enroll 済み factor の一覧を取得して初期表示に渡す。
 */

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/settings/security");

  // 現在の MFA factors を初期データとして渡す (クライアント側で listFactors を再呼び出しして最新化)
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const totpFactors = (factorsData?.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? null,
    status: f.status, // "verified" | "unverified"
    createdAt: f.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        tag="SECURITY"
        title="セキュリティ設定"
        description="2 要素認証 (2FA) の設定と、アカウントのセキュリティ状態を管理します。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            店舗設定へ戻る
          </Link>
        }
      />

      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">
            ACCOUNT
          </div>
          <div className="mt-1 text-base font-semibold text-primary">
            アカウント情報
          </div>
        </div>
        <div className="text-sm text-secondary">
          <div className="flex items-center gap-2">
            <span className="text-muted">ログイン中:</span>
            <span className="font-medium text-primary">
              {user.email ?? user.id}
            </span>
          </div>
        </div>
      </section>

      <SecurityClient initialTotpFactors={totpFactors} />

      <section className="glass-card p-5 text-sm text-secondary space-y-2">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          INFO
        </div>
        <div className="text-base font-semibold text-primary">
          2 要素認証とは
        </div>
        <p>
          パスワードに加えて、認証アプリ (Google Authenticator / 1Password / Authy
          など) が生成する 6 桁のコードを要求することで、パスワードが漏れた場合でも
          不正ログインを防ぎます。保険会社や顧客の個人情報を扱う施工店管理者の
          アカウントには特に推奨されます。
        </p>
        <p className="text-xs text-muted">
          * 2FA を有効化すると、次回ログイン以降は毎回コードの入力が必要になります。
          認証デバイスを紛失した場合に備え、バックアップコードの保管や、
          予備の認証手段の準備を強く推奨します。
        </p>
      </section>
    </div>
  );
}
