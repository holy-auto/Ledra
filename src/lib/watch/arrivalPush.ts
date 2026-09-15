import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ArrivalPushArgs = {
  tenantId: string;
  reservationId: string;
};

export function isExpoPushToken(token: string): boolean {
  return /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

export function arrivalPushMessage(token: string, reservation: { id: string; plate: string; customer: string }) {
  return {
    to: token,
    sound: "default",
    title: "お客様が来店しました",
    body: `${reservation.customer}・${reservation.plate}`,
    categoryId: "customer_arrived",
    data: {
      route: `/work/${reservation.id}`,
      reservationId: reservation.id,
    },
  };
}

/** 担当者がいれば担当者、未割当なら同一テナントの端末へ来店Pushを送る。 */
export async function notifyCustomerArrived({ tenantId: rawTenantId, reservationId }: ArrivalPushArgs): Promise<void> {
  const { admin, tenantId } = createTenantScopedAdmin(rawTenantId);
  const { data: reservation, error } = await admin
    .from("reservations")
    .select("id, assigned_user_id, customers(name), vehicles(plate_display)")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error || !reservation) return;

  let tokenQuery = admin.from("push_tokens").select("token").eq("tenant_id", tenantId);
  if (reservation.assigned_user_id) tokenQuery = tokenQuery.eq("user_id", reservation.assigned_user_id);
  const { data: rows, error: tokenError } = await tokenQuery;
  if (tokenError) throw tokenError;

  const tokens = [...new Set((rows ?? []).map((row) => String(row.token)).filter(isExpoPushToken))];
  if (tokens.length === 0) return;

  const customer = Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers;
  const vehicle = Array.isArray(reservation.vehicles) ? reservation.vehicles[0] : reservation.vehicles;
  const messages = tokens.map((token) =>
    arrivalPushMessage(token, {
      id: reservation.id as string,
      customer: customer?.name?.trim() || "お客様",
      plate: vehicle?.plate_display?.trim() || "車両",
    }),
  );

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    logger.warn("arrival push failed", { tenantId, reservationId, status: response.status });
  }
}
