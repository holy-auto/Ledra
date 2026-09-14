import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { parseMenuItems } from "@/lib/reservationItems";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { receiptUrl } from "@/lib/certificateLinks";
import { ReceiptShareDialog } from "@/components/ReceiptShareDialog";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  received_amount: number | null;
  change_amount: number | null;
  /** pos_checkout が作る領収書。public_id はレシート公開URL /receipt/[public_id] のトークン */
  document: { public_id: string | null } | null;
  reservation: {
    id: string;
    customer: { name: string; phone: string | null } | null;
    vehicle: { plate_display: string; maker: string | null; model: string | null } | null;
    menu_items_json: unknown;
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  card: "カード",
  qr: "QR決済",
  bank_transfer: "振込",
};

interface TenantInvoiceInfo {
  name: string;
  registration_number: string | null;
  address: string | null;
  contact_phone: string | null;
}

export default function PosReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [shareOpen, setShareOpen] = useState(false);
  const [snack, setSnack] = useState("");

  const { data: tenant } = useQuery<TenantInvoiceInfo | null>({
    queryKey: ["tenant-invoice", user?.tenantId],
    queryFn: async () => {
      if (!user?.tenantId) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("name, registration_number, address, contact_phone")
        .eq("id", user.tenantId)
        .single();
      if (error) throw error;
      return data as TenantInvoiceInfo;
    },
    enabled: !!user?.tenantId,
  });

  const { data: payment, isLoading } = useQuery<Payment>({
    queryKey: ["payment-receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id, amount, payment_method, paid_at, received_amount, change_amount,
          document:documents(public_id),
          reservation:reservations(
            id,
            customer:customers(name, phone),
            vehicle:vehicles(plate_display, maker, model),
            menu_items_json
          )
        `
        )
        .eq("reservation_id", id)
        .order("paid_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as Payment;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.center}>
        <Text>レシートが見つかりません</Text>
      </View>
    );
  }

  const paidDate = new Date(payment.paid_at);

  // 内税方式 (10%): 表示価格に税が含まれる前提
  const TAX_RATE = 0.1;
  const taxIncluded = payment.amount;
  const taxAmount = Math.round(taxIncluded - taxIncluded / (1 + TAX_RATE));
  const subtotal = taxIncluded - taxAmount;

  // 公開URLが組み立てられないときは共有導線ごと出さない。
  // 以前はここで `https://app.ledra.co.jp/c/${id}` を渡しており、`id` は予約ID、
  // /c は証明書の公開ページなので**お客様に送ったリンクは必ず404だった**。
  const shareUrl = receiptUrl(payment.document?.public_id);

  return (
    <>
      <Stack.Screen options={{ title: "レシート" }} />
      <ScrollView style={styles.container}>
        {/* 発行者情報 (適格請求書としての要件) */}
        {tenant && (
          <View style={styles.card}>
            <Text style={styles.issuerName}>
              {tenant.name}
            </Text>
            {tenant.address && (
              <Text style={styles.issuerSub}>
                {tenant.address}
              </Text>
            )}
            {tenant.contact_phone && (
              <Text style={styles.issuerSub}>
                TEL: {tenant.contact_phone}
              </Text>
            )}
            {tenant.registration_number && (
              <Text style={styles.regNumber}>
                登録番号: {tenant.registration_number}
              </Text>
            )}
          </View>
        )}

        {/* Header */}
        <View style={styles.card}>
          <View style={styles.receiptHeader}>
            <Text style={styles.checkmark}>
              {"✓"}
            </Text>
            <Text style={styles.paidText}>
              お支払い完了
            </Text>
            <Text style={styles.amount}>
              {"¥"}
              {payment.amount.toLocaleString()}
            </Text>
            <Text style={styles.subText}>
              {METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
            </Text>
            <Text style={styles.dateText}>
              {paidDate.toLocaleDateString("ja-JP")}{" "}
              {paidDate.toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>

        {/* Customer & Vehicle */}
        {payment.reservation && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              顧客 / 車両
            </Text>
            <Text style={styles.customerName}>
              {payment.reservation.customer?.name ?? "不明"}
            </Text>
            {payment.reservation.customer?.phone && (
              <Text style={styles.subText}>
                {payment.reservation.customer.phone}
              </Text>
            )}
            <Text style={styles.vehicleText}>
              {payment.reservation.vehicle?.plate_display ?? ""}{" "}
              {[
                payment.reservation.vehicle?.maker,
                payment.reservation.vehicle?.model,
              ]
                .filter(Boolean)
                .join(" ")}
            </Text>
          </View>
        )}

        {/* Line Items */}
        {payment.reservation && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              明細
            </Text>
            {parseMenuItems(payment.reservation.menu_items_json).map((item, i) => (
              <View key={`${item.menu_item_id ?? item.name}-${i}`} style={styles.lineItem}>
                <Text style={[styles.bodyText, { flex: 1 }]}>{item.name}</Text>
                {item.quantity !== 1 && <Text style={styles.subText}>x{item.quantity}</Text>}
                <Text style={styles.price}>
                  {item.amount === null ? "金額不明" : `¥${item.amount.toLocaleString()}`}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />

            {/* 適格請求書要件: 税率ごとの合計と税額を分離表示 */}
            <View style={styles.lineItem}>
              <Text style={[styles.bodyText, { flex: 1 }]}>
                小計（税抜）
              </Text>
              <Text style={styles.bodyText}>
                {"¥"}
                {subtotal.toLocaleString()}
              </Text>
            </View>
            <View style={styles.lineItem}>
              <Text style={[styles.bodyText, { flex: 1 }]}>
                消費税 ({Math.round(TAX_RATE * 100)}% 対象 {"¥"}
                {subtotal.toLocaleString()})
              </Text>
              <Text style={styles.bodyText}>
                {"¥"}
                {taxAmount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.lineItem}>
              <Text style={[styles.totalLabel, { flex: 1 }]}>
                合計（税込）
              </Text>
              <Text style={styles.totalLabel}>
                {"¥"}
                {payment.amount.toLocaleString()}
              </Text>
            </View>
            {payment.payment_method === "cash" && (
              <>
                <View style={styles.lineItem}>
                  <Text style={[styles.bodyText, { flex: 1 }]}>
                    お預かり
                  </Text>
                  <Text style={styles.bodyText}>
                    {"¥"}
                    {(payment.received_amount ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.lineItem}>
                  <Text style={[styles.bodyText, { flex: 1 }]}>
                    おつり
                  </Text>
                  <Text style={styles.bodyText}>
                    {"¥"}
                    {(payment.change_amount ?? 0).toLocaleString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {/* Apple TTP 要件 5.10: デジタルレシート送信。
              壊れたリンクを送らせないため、URLが無いときはボタンを出さない。 */}
          {shareUrl && (
            <LedraButton
              icon="email-outline"
              onPress={() => setShareOpen(true)}
            >
              レシートを送る
            </LedraButton>
          )}
          <LedraButton
            variant="outline"
            icon="certificate"
            onPress={() =>
              router.push(`/certificates/new?reservationId=${id}`)
            }
          >
            証明書を作成
          </LedraButton>
          <LedraButton
            variant="ghost"
            icon="home"
            onPress={() => router.replace("/(tabs)")}
          >
            ホームに戻る
          </LedraButton>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      {shareUrl && (
        <ReceiptShareDialog
          visible={shareOpen}
          receiptUrl={shareUrl}
          onDismiss={() => setShareOpen(false)}
          onSent={() => setSnack("レシートを送信しました")}
        />
      )}
      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={2500}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snack}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  issuerName: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  issuerSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  regNumber: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs + 2,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  receiptHeader: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
  },
  checkmark: {
    fontSize: 48,
    color: colors.success,
  },
  paidText: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  amount: {
    ...typography.hero,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dateText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customerName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  vehicleText: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  price: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  actions: { padding: spacing.lg, gap: spacing.md },
});
