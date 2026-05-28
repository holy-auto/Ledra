import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import TransferInitiateForm from "./TransferInitiateForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "受諾待ち",
  accepted: "受諾済み",
  rejected: "辞退済み",
  cancelled: "キャンセル済み",
  expired: "期限切れ",
};

export default async function PassportTransferAdminPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/vehicles");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  const { data: vehicleRaw } = await admin
    .from("vehicles")
    .select(
      "id, tenant_id, maker, model, year, vin_code, vin_code_normalized, " +
        "customer_name, customer_email, passport_opt_out",
    )
    .eq("id", id)
    .eq("tenant_id", caller.tenantId)
    .maybeSingle();

  const vehicle = vehicleRaw as {
    id: string;
    tenant_id: string;
    maker: string | null;
    model: string | null;
    year: number | null;
    vin_code: string | null;
    vin_code_normalized: string | null;
    customer_name: string | null;
    customer_email: string | null;
    passport_opt_out: boolean;
  } | null;

  if (!vehicle) notFound();

  // Look up the passport row so we can show "ownership history"
  // even when no transfers have happened yet.
  type PassportRow = {
    current_owner_email: string | null;
    current_owner_name: string | null;
    ownership_set_at: string | null;
  };
  let passport: PassportRow | null = null;
  if (vehicle.vin_code_normalized) {
    const { data: pRaw } = await admin
      .from("vehicle_passports")
      .select("current_owner_email, current_owner_name, ownership_set_at")
      .eq("vin_code_normalized", vehicle.vin_code_normalized)
      .maybeSingle();
    passport = (pRaw as PassportRow | null) ?? null;
  }

  // Recent transfer history for this VIN (scoped to this tenant
  // via RLS — only the tenant that initiated each transfer can
  // see it). For full ownership history across tenants we'd need
  // a separate platform-admin view.
  let transfers: Array<{
    id: string;
    status: string;
    to_owner_email: string;
    to_owner_name: string | null;
    initiated_at: string;
    expires_at: string;
    responded_at: string | null;
  }> = [];
  if (vehicle.vin_code_normalized) {
    const { data: tRaw } = await admin
      .from("passport_ownership_transfers")
      .select("id, status, to_owner_email, to_owner_name, initiated_at, expires_at, responded_at")
      .eq("vin_code_normalized", vehicle.vin_code_normalized)
      .eq("initiating_tenant_id", caller.tenantId)
      .order("initiated_at", { ascending: false })
      .limit(10);
    transfers = (tRaw as typeof transfers) ?? [];
  }

  const pendingExists = transfers.some((t) => t.status === "pending");

  const vehicleLabel = [vehicle.maker, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "車両";
  const canInitiate = !!vehicle.vin_code_normalized && !vehicle.passport_opt_out && !pendingExists;
  const publicEnabled = isPassportPublicEnabled();

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 text-zinc-900">
      <header className="space-y-1">
        <Link
          href={`/admin/vehicles/${vehicle.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
        >
          ← 車両詳細に戻る
        </Link>
        <h1 className="text-2xl font-bold">車両パスポート所有権移転</h1>
        <p className="text-sm text-zinc-600">
          {vehicleLabel} / VIN末尾 {vehicle.vin_code_normalized?.slice(-6) ?? "—"}
        </p>
      </header>

      {!publicEnabled ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">公開機能は現在無効です (PASSPORT_PUBLIC_ENABLED ≠ true)</p>
          <p className="mt-1 text-xs">
            移転依頼メールに含まれる受諾リンク (/passport/transfer/&lt;token&gt;) は受信者側で 404
            になります。社内検証以外の用途では送信しないでください。
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">現在の所有者</h2>
        {passport?.current_owner_email ? (
          <dl className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-zinc-500">メール</dt>
              <dd className="break-all text-right">{passport.current_owner_email}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-zinc-500">表示名</dt>
              <dd className="text-right">{passport.current_owner_name ?? "—"}</dd>
            </div>
            {passport.ownership_set_at ? (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500">設定日</dt>
                <dd className="text-right">{formatDateTime(passport.ownership_set_at)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-zinc-600">
            まだパスポート所有者は登録されていません。最初の移転受諾時に登録されます。
            <br />
            <span className="text-xs text-zinc-500">
              （車両登録時のお客様情報: {vehicle.customer_email ?? "—"} / {vehicle.customer_name ?? "—"}）
            </span>
          </p>
        )}
      </section>

      {canInitiate ? (
        <TransferInitiateForm vehicleId={vehicle.id} />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {!vehicle.vin_code_normalized && "車台番号(VIN)が未登録です。先に車両情報を更新してください。"}
          {vehicle.passport_opt_out && "この車両はパスポート公開がオフです。先にオンに切り替えてください。"}
          {pendingExists && "保留中の移転リクエストがあります。下記から処理してください。"}
        </section>
      )}

      {transfers.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">直近の履歴</h2>
          <ul className="space-y-2">
            {transfers.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t.to_owner_name ?? t.to_owner_email}</p>
                    <p className="text-xs text-zinc-500 break-all">{t.to_owner_email}</p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  依頼: {formatDateTime(t.initiated_at)} / 期限: {formatDateTime(t.expires_at)}
                  {t.responded_at ? ` / 応答: ${formatDateTime(t.responded_at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
