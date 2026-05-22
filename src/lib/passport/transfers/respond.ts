import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { hashTransferToken } from "./tokens";
import { sendTransferAcceptedNotification } from "./email";
import { logAuditEvent } from "@/lib/audit/certificateLog";
import { logger } from "@/lib/logger";

type TransferRow = {
  id: string;
  vin_code_normalized: string;
  initiating_tenant_id: string;
  initiating_vehicle_id: string | null;
  from_owner_email: string | null;
  from_owner_name: string | null;
  to_owner_email: string;
  to_owner_name: string | null;
  status: string;
  expires_at: string;
  message: string | null;
};

export type PublicTransferView = {
  id: string;
  vin_short: string; // last 6 chars only
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
  to_owner_email: string;
  to_owner_name: string | null;
  message: string | null;
  expires_at: string;
  shop_name: string | null;
  vehicle_label: string | null;
};

/** Public read by raw token: returns the minimal data the
 * recipient needs to make an accept/reject decision. */
export async function getTransferByToken(rawToken: string): Promise<PublicTransferView | null> {
  let tokenHash: string;
  try {
    tokenHash = hashTransferToken(rawToken);
  } catch {
    return null;
  }

  const admin = createServiceRoleAdmin("passport transfer — public token lookup (pre-auth)");
  const { data: rowRaw } = await admin
    .from("passport_ownership_transfers")
    .select(
      "id, vin_code_normalized, initiating_tenant_id, initiating_vehicle_id, " +
        "from_owner_email, from_owner_name, to_owner_email, to_owner_name, " +
        "status, expires_at, message",
    )
    .eq("transfer_token_hash", tokenHash)
    .maybeSingle();

  const row = rowRaw as TransferRow | null;
  if (!row) return null;

  // Resolve status: if pending but past expiry, present as expired
  // (the cron sweep will materialize the status change soon, but
  // we don't want to render a misleading "Accept" button).
  const effectiveStatus =
    row.status === "pending" && new Date(row.expires_at).getTime() < Date.now()
      ? "expired"
      : (row.status as PublicTransferView["status"]);

  // Look up shop + vehicle display info (best-effort).
  const [{ data: tenant }, { data: vehicle }] = await Promise.all([
    admin.from("tenants").select("name, slug").eq("id", row.initiating_tenant_id).maybeSingle(),
    row.initiating_vehicle_id
      ? admin.from("vehicles").select("maker, model, year").eq("id", row.initiating_vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const vehicleLabel = vehicle
    ? [
        (vehicle as { maker: string | null }).maker,
        (vehicle as { model: string | null }).model,
        (vehicle as { year: number | null }).year,
      ]
        .filter(Boolean)
        .join(" ") || null
    : null;

  return {
    id: row.id,
    vin_short: row.vin_code_normalized.slice(-6),
    status: effectiveStatus,
    to_owner_email: row.to_owner_email,
    to_owner_name: row.to_owner_name,
    message: row.message,
    expires_at: row.expires_at,
    shop_name:
      (tenant as { name: string | null; slug: string | null } | null)?.name ??
      (tenant as { name: string | null; slug: string | null } | null)?.slug ??
      null,
    vehicle_label: vehicleLabel,
  };
}

export type AcceptResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "not_pending" | "expired" | "db_error";
      message: string;
    };

/**
 * Accept a transfer by raw token. Marks the transfer accepted,
 * updates the passport's current owner, and notifies the shop.
 *
 * Idempotency: a successful accept is final. A second call
 * returns `not_pending`.
 */
export async function acceptTransferByToken(args: {
  rawToken: string;
  acceptedByName: string | null;
}): Promise<AcceptResult> {
  let tokenHash: string;
  try {
    tokenHash = hashTransferToken(args.rawToken);
  } catch {
    return { ok: false, reason: "not_found", message: "リンクが無効です。" };
  }

  const admin = createServiceRoleAdmin("passport transfer — accept by recipient token");

  const { data: rowRaw } = await admin
    .from("passport_ownership_transfers")
    .select(
      "id, vin_code_normalized, initiating_tenant_id, initiating_vehicle_id, " +
        "from_owner_email, to_owner_email, status, expires_at",
    )
    .eq("transfer_token_hash", tokenHash)
    .maybeSingle();
  const row = rowRaw as TransferRow | null;

  if (!row) return { ok: false, reason: "not_found", message: "リンクが無効です。" };
  if (row.status !== "pending")
    return { ok: false, reason: "not_pending", message: "このリクエストは既に処理済みです。" };
  if (new Date(row.expires_at).getTime() < Date.now())
    return { ok: false, reason: "expired", message: "このリクエストは期限切れです。" };

  const now = new Date().toISOString();
  const acceptedName = args.acceptedByName?.trim() || null;

  // Use a conditional update so concurrent accept/expire races
  // resolve to a single winner.
  const { data: updatedRaw, error: updateErr } = await admin
    .from("passport_ownership_transfers")
    .update({
      status: "accepted",
      responded_at: now,
      to_owner_name: acceptedName ?? row.to_owner_name,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    logger.error("acceptTransferByToken update failed", { error: updateErr.message });
    return { ok: false, reason: "db_error", message: "状態の更新に失敗しました。" };
  }
  if (!updatedRaw) {
    return { ok: false, reason: "not_pending", message: "このリクエストは既に処理済みです。" };
  }

  // Flip the passport's current owner.
  const { error: passportErr } = await admin
    .from("vehicle_passports")
    .update({
      current_owner_email: row.to_owner_email,
      current_owner_name: acceptedName,
      ownership_set_at: now,
      pii_masked_at: now,
    })
    .eq("vin_code_normalized", row.vin_code_normalized);
  if (passportErr) {
    logger.error("acceptTransferByToken passport update failed", { error: passportErr.message });
    // Don't fail the request — the transfer record is the source
    // of truth and a reconciliation job can fix the passport row.
  }

  // Audit on the initiating tenant.
  void logAuditEvent({
    type: "note",
    tenantId: row.initiating_tenant_id,
    title: "パスポート所有権移転が受諾されました",
    description: `VIN末尾: ${row.vin_code_normalized.slice(-6)} / 新オーナー: ${row.to_owner_email}`,
    vehicleId: row.initiating_vehicle_id,
  });

  // Notify the shop (best-effort).
  void notifyShopAccepted({
    initiatingTenantId: row.initiating_tenant_id,
    initiatingVehicleId: row.initiating_vehicle_id,
    vinNormalized: row.vin_code_normalized,
    acceptedByEmail: row.to_owner_email,
    acceptedByName: acceptedName,
  });

  return { ok: true };
}

async function notifyShopAccepted(args: {
  initiatingTenantId: string;
  initiatingVehicleId: string | null;
  vinNormalized: string;
  acceptedByEmail: string;
  acceptedByName: string | null;
}): Promise<void> {
  const admin = createServiceRoleAdmin("passport transfer — accepted notification email");
  const [{ data: tenant }, { data: vehicle }] = await Promise.all([
    admin.from("tenants").select("name, slug, contact_email").eq("id", args.initiatingTenantId).maybeSingle(),
    args.initiatingVehicleId
      ? admin.from("vehicles").select("maker, model, year").eq("id", args.initiatingVehicleId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const tenantRec = tenant as { name: string | null; slug: string | null; contact_email: string | null } | null;
  if (!tenantRec?.contact_email) return;

  const vehicleLabel = vehicle
    ? [
        (vehicle as { maker: string | null }).maker,
        (vehicle as { model: string | null }).model,
        (vehicle as { year: number | null }).year,
      ]
        .filter(Boolean)
        .join(" ") || "車両"
    : "車両";

  await sendTransferAcceptedNotification({
    toEmail: tenantRec.contact_email,
    shopName: tenantRec.name ?? tenantRec.slug ?? "施工店",
    vehicleLabel,
    passportShortId: args.vinNormalized.slice(-6),
    acceptedByName: args.acceptedByName,
    acceptedByEmail: args.acceptedByEmail,
  });
}

export type RejectResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_pending" | "expired"; message: string };

export async function rejectTransferByToken(rawToken: string): Promise<RejectResult> {
  let tokenHash: string;
  try {
    tokenHash = hashTransferToken(rawToken);
  } catch {
    return { ok: false, reason: "not_found", message: "リンクが無効です。" };
  }

  const admin = createServiceRoleAdmin("passport transfer — reject by recipient token");

  const { data: updatedRaw, error: updateErr } = await admin
    .from("passport_ownership_transfers")
    .update({ status: "rejected", responded_at: new Date().toISOString() })
    .eq("transfer_token_hash", tokenHash)
    .eq("status", "pending")
    .select("id, initiating_tenant_id, vin_code_normalized, initiating_vehicle_id")
    .maybeSingle();

  if (updateErr) {
    logger.error("rejectTransferByToken update failed", { error: updateErr.message });
    return { ok: false, reason: "not_pending", message: "状態の更新に失敗しました。" };
  }
  if (!updatedRaw) return { ok: false, reason: "not_pending", message: "このリクエストは既に処理済みです。" };

  const updated = updatedRaw as {
    id: string;
    initiating_tenant_id: string;
    vin_code_normalized: string;
    initiating_vehicle_id: string | null;
  };

  void logAuditEvent({
    type: "note",
    tenantId: updated.initiating_tenant_id,
    title: "パスポート所有権移転が辞退されました",
    description: `VIN末尾: ${updated.vin_code_normalized.slice(-6)}`,
    vehicleId: updated.initiating_vehicle_id,
  });

  return { ok: true };
}

export type CancelResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_pending" | "forbidden"; message: string };

/** Cancel a pending transfer by id. Only the initiating tenant can cancel. */
export async function cancelTransferById(args: { transferId: string; tenantId: string }): Promise<CancelResult> {
  const admin = createServiceRoleAdmin("passport transfer — cancel by initiating tenant");

  const { data: rowRaw } = await admin
    .from("passport_ownership_transfers")
    .select("id, initiating_tenant_id, status, vin_code_normalized, initiating_vehicle_id")
    .eq("id", args.transferId)
    .maybeSingle();
  const row = rowRaw as {
    id: string;
    initiating_tenant_id: string;
    status: string;
    vin_code_normalized: string;
    initiating_vehicle_id: string | null;
  } | null;

  if (!row) return { ok: false, reason: "not_found", message: "リクエストが見つかりません。" };
  if (row.initiating_tenant_id !== args.tenantId)
    return { ok: false, reason: "forbidden", message: "このリクエストはキャンセルできません。" };
  if (row.status !== "pending")
    return { ok: false, reason: "not_pending", message: "保留中ではないためキャンセルできません。" };

  const { data: updated } = await admin
    .from("passport_ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!updated) return { ok: false, reason: "not_pending", message: "保留中ではないためキャンセルできません。" };

  void logAuditEvent({
    type: "note",
    tenantId: args.tenantId,
    title: "パスポート所有権移転をキャンセル",
    description: `VIN末尾: ${row.vin_code_normalized.slice(-6)}`,
    vehicleId: row.initiating_vehicle_id,
  });

  return { ok: true };
}
