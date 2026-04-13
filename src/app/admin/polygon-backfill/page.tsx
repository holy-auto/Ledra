import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import BackfillRunner from "./BackfillRunner";

export const dynamic = "force-dynamic";

export default async function PolygonBackfillPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/polygon-backfill");

  const caller = await resolveCallerWithRole(supabase);
  if (!caller) {
    return (
      <div className="text-sm text-muted">
        tenant_memberships が見つかりません。
      </div>
    );
  }

  if (!requireMinRole(caller, "admin")) {
    return (
      <div className="space-y-6">
        <PageHeader
          tag="BLOCKCHAIN BACKFILL"
          title="ブロックチェーン・バックフィル"
          description="この機能は管理者 (admin) ロールでのみ利用できます。"
        />
        <section className="glass-card p-5 text-sm text-amber-400">
          権限が不足しています。管理者に依頼してください。
        </section>
      </div>
    );
  }

  const enabled = process.env.POLYGON_ANCHOR_ENABLED === "true";
  const network = process.env.POLYGON_NETWORK ?? "polygon";

  return (
    <div className="space-y-6">
      <PageHeader
        tag="BLOCKCHAIN BACKFILL"
        title="ブロックチェーン・バックフィル"
        description="過去に発行した施工画像を Polygon ブロックチェーンに遡及記録します。"
        actions={
          <Link href="/admin" className="btn-secondary">
            ダッシュボード
          </Link>
        }
      />

      <section className="glass-card p-5 space-y-2">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">ENVIRONMENT</div>
        <div className="mt-1 text-sm text-primary">
          <span className="text-muted">状態:</span>{" "}
          <span className={enabled ? "text-emerald-400" : "text-amber-400"}>
            {enabled ? "有効" : "無効（POLYGON_ANCHOR_ENABLED 未設定）"}
          </span>
        </div>
        <div className="text-sm text-primary">
          <span className="text-muted">ネットワーク:</span>{" "}
          <span>{network === "amoy" ? "Polygon Amoy (testnet)" : "Polygon Mainnet"}</span>
        </div>
        <p className="text-xs text-muted">
          過去に SHA-256 だけ計算済みでまだブロックチェーンに記録されていない施工画像を、
          1 回あたり最大 20 件ずつバッチ処理します。mainnet ではバッチごとに約 0.001〜0.002 POL
          のガス代が発生します（Amoy は無料）。
        </p>
      </section>

      <BackfillRunner enabled={enabled} />
    </div>
  );
}
