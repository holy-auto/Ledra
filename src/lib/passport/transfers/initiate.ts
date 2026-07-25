import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { generateTransferToken } from "./tokens";
import { sendTransferInvitation } from "./email";
import { logAuditEvent } from "@/lib/audit/certificateLog";
import { logger } from "@/lib/logger";

const DEFAULT_TTL_DAYS = 14;
const MAX_TTL_DAYS = 30;

export type InitiateResult =
  | { ok: true; transferId: string; expiresAt: string }
  | {
      ok: false;
      reason:
        | "vehicle_not_found"
        | "vehicle_no_vin"
        | "vehicle_opted_out"
        | "passport_not_found"
        | "pending_transfer_exists"
        | "to_email_invalid"
        | "to_email_same_as_current"
        | "db_error";
      message: string;
    };

function lowercaseEmail(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Initiate an ownership transfer for the passport associated
 * with a given (tenant_id, vehicle_id) pair.
 *
 * The caller is a tenant member of `tenantId`. We trust them
 * to have confirmed offline that the current owner consents
 * (e.g. they're standing in the shop selling the car).
 *
 * On success the function:
 *   1. Inserts a `passport_ownership_transfers` row (status=pending)
 *   2. Sends the invitation email to the new owner
 *   3. Logs `passport_transfer_initiated` to vehicle_histories
 */
export async function initiatePassportTransfer(args: {
  tenantId: string;
  vehicleId: string;
  userId: string | null;
  toEmail: string;
  toName: string | null;
  message: string | null;
  ttlDays?: number;
}): Promise<InitiateResult> {
  const toEmail = lowercaseEmail(args.toEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return { ok: false, reason: "to_email_invalid", message: "メールアドレスの形式が不正です。" };
  }

  const ttlDays = Math.min(Math.max(args.ttlDays ?? DEFAULT_TTL_DAYS, 1), MAX_TTL_DAYS);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const { admin } = createTenantScopedAdmin(args.tenantId);

  // 1) Fetch vehicle + tenant; verify VIN + not opted out
  const { data: vehicleRaw } = await admin
    .from("vehicles")
    .select(
      "id, tenant_id, vin_code, vin_code_normalized, passport_opt_out, customers(name, email), maker, model, year",
    )
    .eq("id", args.vehicleId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  const vehicle = vehicleRaw as {
    id: string;
    tenant_id: string;
    vin_code: string | null;
    vin_code_normalized: string | null;
    passport_opt_out: boolean;
    // 顧客情報は customers テーブルに正規化済み（vehicles からは削除）。FK 埋め込みで取得する。
    customers: { name: string | null; email: string | null } | null;
    maker: string | null;
    model: string | null;
    year: number | null;
  } | null;

  if (!vehicle) {
    return { ok: false, reason: "vehicle_not_found", message: "対象車両が見つかりません。" };
  }
  if (!vehicle.vin_code_normalized) {
    return { ok: false, reason: "vehicle_no_vin", message: "車台番号(VIN)が未登録の車両は移転できません。" };
  }
  if (vehicle.passport_opt_out) {
    return {
      ok: false,
      reason: "vehicle_opted_out",
      message: "パスポート公開がオフになっている車両は移転できません。",
    };
  }

  const vin = normalizeVin(vehicle.vin_code_normalized);

  // 2) Fetch the passport row. Required: ownership transfer is
  //    only meaningful for vehicles with an existing passport
  //    (i.e. at least one anchored certificate exists).
  const { data: passportRaw } = await admin
    .from("vehicle_passports")
    .select("id, current_owner_email, display_maker, display_model, display_year")
    .eq("vin_code_normalized", vin)
    .maybeSingle();
  const passport = passportRaw as {
    id: string;
    current_owner_email: string | null;
    display_maker: string | null;
    display_model: string | null;
    display_year: number | null;
  } | null;

  if (!passport) {
    return {
      ok: false,
      reason: "passport_not_found",
      message: "この車両にはパスポートが存在しません。最初の証明書がアンカーされてから再度お試しください。",
    };
  }

  if (passport.current_owner_email && passport.current_owner_email.toLowerCase() === toEmail) {
    return {
      ok: false,
      reason: "to_email_same_as_current",
      message: "移転先のメールアドレスが現在のオーナーと同一です。",
    };
  }

  // 3) Check for an existing pending transfer (unique index will
  //    also catch a race, but the explicit check yields a clean
  //    error message).
  const { data: existing } = await admin
    .from("passport_ownership_transfers")
    .select("id")
    .eq("vin_code_normalized", vin)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      reason: "pending_transfer_exists",
      message: "この車両には保留中の移転リクエストが既にあります。先にキャンセルしてください。",
    };
  }

  // 4) Look up the initiating tenant's display name for the email.
  const { data: tenantRow } = await admin.from("tenants").select("name, slug").eq("id", args.tenantId).maybeSingle();
  const shopName = (tenantRow?.name as string | undefined) ?? (tenantRow?.slug as string | undefined) ?? "施工店";

  // 5) Generate token + insert row.
  const { rawToken, tokenHash } = generateTransferToken();

  const { data: insertedRaw, error: insertErr } = await admin
    .from("passport_ownership_transfers")
    .insert({
      vin_code_normalized: vin,
      initiating_tenant_id: args.tenantId,
      initiating_vehicle_id: vehicle.id,
      initiated_by_user_id: args.userId,
      from_owner_email: passport.current_owner_email ?? vehicle.customers?.email ?? null,
      from_owner_name: vehicle.customers?.name ?? null,
      to_owner_email: toEmail,
      to_owner_name: args.toName?.trim() || null,
      transfer_token_hash: tokenHash,
      message: args.message?.trim() || null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !insertedRaw) {
    // Most likely cause: race with the partial unique index. Map
    // to the same friendly message.
    if (insertErr?.code === "23505") {
      return {
        ok: false,
        reason: "pending_transfer_exists",
        message: "この車両には保留中の移転リクエストが既にあります。",
      };
    }
    logger.error("initiatePassportTransfer insert failed", { error: insertErr?.message });
    return { ok: false, reason: "db_error", message: "リクエストの保存に失敗しました。" };
  }

  const inserted = insertedRaw as { id: string };

  const vehicleLabel =
    [
      vehicle.maker ?? passport.display_maker,
      vehicle.model ?? passport.display_model,
      vehicle.year ?? passport.display_year,
    ]
      .filter(Boolean)
      .join(" ") || "車両";

  // 6) Send invitation email (best-effort; failures are logged).
  await sendTransferInvitation({
    toEmail,
    toName: args.toName?.trim() || null,
    fromShopName: shopName,
    vehicleLabel,
    passportShortId: vin.slice(-6),
    rawToken,
    expiresAt,
    message: args.message?.trim() || null,
  });

  // 7) Audit log (fire-and-forget).
  void logAuditEvent({
    type: "note",
    tenantId: args.tenantId,
    title: "パスポート所有権移転を依頼",
    description: `VIN末尾: ${vin.slice(-6)} / 移転先: ${toEmail}`,
    vehicleId: args.vehicleId,
  });

  return { ok: true, transferId: inserted.id, expiresAt: expiresAt.toISOString() };
}
