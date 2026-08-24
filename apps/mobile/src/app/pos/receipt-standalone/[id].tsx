import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  ActivityIndicator,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface StandalonePayment {
  id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  received_amount: number | null;
  change_amount: number | null;
  note: string | null;
  document: {
    id: string;
    doc_number: string;
    // 品名は description（帳票の正準キー）。name は旧モバイルビルドが書いた行
    items_json:
      | { description?: string; name?: string; quantity: number; unit_price: number; amount: number }[]
      | null;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
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

export default function StandaloneReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

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

  const { data: payment, isLoading } = useQuery<StandalonePayment>({
    queryKey: ["standalone-receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id, amount, payment_method, paid_at, received_amount, change_amount, note,
          document:documents(id, doc_number, items_json, subtotal, tax, total)
        `,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as StandalonePayment;
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
  const TAX_RATE = 0.1;
  const taxIncluded = payment.amount;
  const taxAmount =
    payment.document?.tax ?? Math.round(taxIncluded - taxIncluded / (1 + TAX_RATE));
  const subtotal = payment.document?.subtotal ?? taxIncluded - taxAmount;
  const items = payment.document?.items_json ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "レシート" }} />
      <ScrollView style={styles.container}>
        {/* 発行者情報 */}
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

        {/* ヘッダー */}
        <View style={styles.card}>
          <View style={styles.receiptHeader}>
            <Text style={styles.checkmark}>
              {"✓"}
            </Text>
            <Text style={styles.paidText}>
              お支払い完了
            </Text>
            <Text style={styles.amount}>
              ¥{payment.amount.toLocaleString()}
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
            {payment.document?.doc_number && (
              <Text style={styles.docNumber}>
                {payment.document.doc_number}
              </Text>
            )}
          </View>
        </View>

        {/* 明細 */}
        {items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              明細
            </Text>
            {items.map((item, index) => (
              <View key={index} style={styles.lineItem}>
                <Text style={[styles.bodyText, { flex: 1 }]}>
                  {item.description ?? item.name}
                </Text>
                <Text style={styles.subText}>
                  x{item.quantity}
                </Text>
                <Text style={styles.price}>
                  ¥{item.amount.toLocaleString()}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />

            <View style={styles.lineItem}>
              <Text style={[styles.bodyText, { flex: 1 }]}>
                小計（税抜）
              </Text>
              <Text style={styles.bodyText}>¥{subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.lineItem}>
              <Text style={[styles.bodyText, { flex: 1 }]}>
                消費税 (10% 対象 ¥{subtotal.toLocaleString()})
              </Text>
              <Text style={styles.bodyText}>¥{taxAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.lineItem}>
              <Text style={[styles.totalLabel, { flex: 1 }]}>
                合計（税込）
              </Text>
              <Text style={styles.totalLabel}>
                ¥{payment.amount.toLocaleString()}
              </Text>
            </View>
            {payment.payment_method === "cash" && (
              <>
                <View style={styles.lineItem}>
                  <Text style={[styles.bodyText, { flex: 1 }]}>
                    お預かり
                  </Text>
                  <Text style={styles.bodyText}>
                    ¥{(payment.received_amount ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.lineItem}>
                  <Text style={[styles.bodyText, { flex: 1 }]}>
                    おつり
                  </Text>
                  <Text style={styles.bodyText}>
                    ¥{(payment.change_amount ?? 0).toLocaleString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* アクション */}
        <View style={styles.actions}>
          <LedraButton
            icon="home"
            onPress={() => router.replace("/(tabs)")}
          >
            ホームに戻る
          </LedraButton>
          <LedraButton
            variant="outline"
            icon="plus-circle"
            onPress={() => router.replace("/pos/walk-in")}
          >
            続けて会計する
          </LedraButton>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>
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
  receiptHeader: { alignItems: "center", paddingVertical: spacing["2xl"] },
  checkmark: { fontSize: 48, color: colors.success },
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
  docNumber: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontFamily: "monospace",
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
  lineItem: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
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
