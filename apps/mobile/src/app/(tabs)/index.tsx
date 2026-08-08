import { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Text, Card, IconButton } from "react-native-paper";
import { router } from "expo-router";

import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { SalesBarChart, type SalesPoint } from "@/components/SalesBarChart";

interface DashboardStats {
  todayReservations: number;
  activeWork: number;
  awaitingPayment: number;
  todayPayments: number;
  preparedNfcTags: number;
}

// 在庫アラート閾値: prepared (uid 未割当) のタグがこれ以下になったら警告
const NFC_LOW_STOCK_THRESHOLD = 10;

const SALES_DAYS = 7;

function buildDateRange(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

export default function HomeScreen() {
  const { user, selectedStore } = useAuthStore();
  const { width, height } = useWindowDimensions();
  // Tap to Pay は iPhone 専用（iPad 非対応）。iPhone のときだけ有効化バナーを出す。
  const isIPhone = Platform.OS === "ios" && Math.min(width, height) < 768;
  const [ttpBannerDismissed, setTtpBannerDismissed] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayReservations: 0,
    activeWork: 0,
    awaitingPayment: 0,
    todayPayments: 0,
    preparedNfcTags: 0,
  });
  const [salesSeries, setSalesSeries] = useState<SalesPoint[]>(() =>
    buildDateRange(SALES_DAYS).map((date) => ({ date, amount: 0 }))
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!user?.tenantId || !selectedStore?.id) return;

    const today = new Date().toISOString().split("T")[0];
    const dateRange = buildDateRange(SALES_DAYS);
    const sevenDaysAgo = dateRange[0];

    const [reservations, work, awaitingPay, payments, preparedTags, salesRows] =
      await Promise.all([
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId)
          .eq("store_id", selectedStore.id)
          .eq("scheduled_date", today)
          .not("status", "eq", "cancelled"),
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId)
          .eq("store_id", selectedStore.id)
          .in("status", ["arrived", "in_progress"]),
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId)
          .eq("store_id", selectedStore.id)
          .eq("status", "completed")
          .eq("payment_status", "unpaid"),
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId)
          .eq("store_id", selectedStore.id)
          .gte("paid_at", today),
        // NFCタグ在庫: tenant 全体で uid 未割当の prepared タグ数
        supabase
          .from("nfc_tags")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId)
          .eq("status", "prepared")
          .is("uid", null),
        supabase
          .from("payments")
          .select("amount, paid_at")
          .eq("tenant_id", user.tenantId)
          .eq("store_id", selectedStore.id)
          .gte("paid_at", sevenDaysAgo),
      ]);

    setStats({
      todayReservations: reservations.count ?? 0,
      activeWork: work.count ?? 0,
      awaitingPayment: awaitingPay.count ?? 0,
      todayPayments: payments.count ?? 0,
      preparedNfcTags: preparedTags.count ?? 0,
    });

    // 直近7日の売上を日付別に集計
    const buckets: Record<string, number> = Object.fromEntries(
      dateRange.map((d) => [d, 0])
    );
    for (const row of (salesRows.data ?? []) as Array<{
      amount: number;
      paid_at: string;
    }>) {
      const dateKey = row.paid_at.split("T")[0];
      if (dateKey in buckets) {
        buckets[dateKey] += row.amount ?? 0;
      }
    }
    setSalesSeries(dateRange.map((date) => ({ date, amount: buckets[date] })));
  }, [user, selectedStore]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function onRefresh() {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text variant="titleLarge" style={styles.greeting}>
            {selectedStore?.name}
          </Text>
          <Text variant="bodySmall" style={styles.role}>
            {user?.email}
          </Text>
        </View>
        <IconButton
          icon="cog-outline"
          onPress={() => router.push("/settings")}
          accessibilityLabel="設定を開く"
        />
      </View>

      {/* Tap to Pay 有効化バナー (Apple 要件 3.1: 発見しやすい導線) */}
      {isIPhone && !ttpBannerDismissed && (
        <Card
          style={[styles.card, styles.ttpCard]}
          mode="outlined"
          onPress={() => router.push("/settings/tap-to-pay")}
        >
          <Card.Content style={styles.ttpContent}>
            <IconButton
              icon="contactless-payment"
              iconColor="#1d4ed8"
              size={24}
              style={{ margin: 0 }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={styles.ttpTitle}>
                iPhone でカード決済を受け付けられます
              </Text>
              <Text variant="bodySmall" style={styles.ttpSub}>
                追加端末なしで Tap to Pay を有効化 →
              </Text>
            </View>
            <IconButton
              icon="close"
              size={18}
              iconColor="#3b82f6"
              onPress={() => setTtpBannerDismissed(true)}
              accessibilityLabel="バナーを閉じる"
            />
          </Card.Content>
        </Card>
      )}

      {/* NFCタグ在庫アラート */}
      {stats.preparedNfcTags <= NFC_LOW_STOCK_THRESHOLD && (
        <Card
          style={[styles.card, styles.alertCard]}
          mode="outlined"
          onPress={() => router.push("/nfc/tags")}
        >
          <Card.Content style={styles.alertContent}>
            <IconButton
              icon="alert-circle-outline"
              iconColor="#b45309"
              size={24}
              style={{ margin: 0 }}
            />
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={styles.alertTitle}>
                NFCタグ在庫が少なくなっています
              </Text>
              <Text variant="bodySmall" style={styles.alertSub}>
                残り {stats.preparedNfcTags} 枚 (閾値 {NFC_LOW_STOCK_THRESHOLD}{" "}
                枚)。発注を検討してください
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.grid}>
        <StatCard
          title="今日の予約"
          value={stats.todayReservations}
          icon="calendar-check"
          color="#3b82f6"
          onPress={() => router.push("/(tabs)/reservations")}
        />
        <StatCard
          title="作業中"
          value={stats.activeWork}
          icon="wrench"
          color="#f59e0b"
          onPress={() => router.push("/(tabs)/work")}
        />
        <StatCard
          title="会計待ち"
          value={stats.awaitingPayment}
          icon="cash-register"
          color="#10b981"
          onPress={() => router.push("/(tabs)/pos")}
        />
        <StatCard
          title="今日の決済"
          value={stats.todayPayments}
          icon="check-circle"
          color="#8b5cf6"
        />
      </View>

      {/* 売上推移 */}
      <View style={styles.salesSection}>
        <View style={styles.salesHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            直近7日の売上
          </Text>
          <Text variant="bodySmall" style={styles.salesTotal}>
            {"¥"}
            {salesSeries
              .reduce((sum, p) => sum + p.amount, 0)
              .toLocaleString()}
          </Text>
        </View>
        <Card mode="outlined" style={styles.salesCard}>
          <Card.Content>
            <SalesBarChart data={salesSeries} width={width - 64} />
          </Card.Content>
        </Card>
      </View>

      <View style={styles.quickActions}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          クイックアクション
        </Text>
        <View style={styles.actionRow}>
          <ActionButton
            icon="account-plus"
            label="顧客登録"
            onPress={() => router.push("/customers/new")}
          />
          <ActionButton
            icon="car-plus"
            label="車両登録"
            onPress={() => router.push("/vehicles/new")}
          />
          <ActionButton
            icon="nfc"
            label="NFCスキャン"
            onPress={() => router.push("/nfc/scan")}
          />
          <ActionButton
            icon="certificate"
            label="証明書"
            onPress={() => router.push("/certificates")}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  onPress,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Card
      style={styles.statCard}
      onPress={onPress}
      mode="outlined"
      accessibilityLabel={`${title}: ${value}件`}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <Card.Content style={styles.statContent}>
        <IconButton
          icon={icon}
          iconColor={color}
          size={24}
          style={{ margin: 0 }}
          // 親 Card が同じラベルを持つので、装飾として TalkBack/VoiceOver からは無視
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text variant="headlineMedium" style={[styles.statValue, { color }]}>
          {value}
        </Text>
        <Text variant="labelSmall" style={styles.statLabel}>
          {title}
        </Text>
      </Card.Content>
    </Card>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.actionItem}>
      <IconButton
        icon={icon}
        mode="contained-tonal"
        size={24}
        onPress={onPress}
        accessibilityLabel={label}
      />
      <Text variant="labelSmall" style={styles.actionLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 8,
  },
  greeting: { fontWeight: "700", color: "#1a1a2e" },
  role: { color: "#71717a", marginTop: 2 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#ffffff",
  },
  card: { marginHorizontal: 12, marginTop: 12, backgroundColor: "#ffffff" },
  alertCard: { borderColor: "#fcd34d", backgroundColor: "#fef3c7" },
  alertContent: { flexDirection: "row", alignItems: "center", gap: 4 },
  alertTitle: { fontWeight: "700", color: "#92400e" },
  alertSub: { color: "#b45309", marginTop: 2 },
  ttpCard: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  ttpContent: { flexDirection: "row", alignItems: "center", gap: 4 },
  ttpTitle: { fontWeight: "700", color: "#1d4ed8" },
  ttpSub: { color: "#3b82f6", marginTop: 2 },
  statContent: {
    alignItems: "center",
    paddingVertical: 12,
  },
  statValue: {
    fontWeight: "700",
    marginTop: 4,
  },
  statLabel: {
    color: "#71717a",
    marginTop: 4,
  },
  salesSection: {
    padding: 16,
    paddingTop: 0,
  },
  salesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  salesTotal: {
    color: "#1a1a2e",
    fontWeight: "700",
  },
  salesCard: {
    backgroundColor: "#ffffff",
  },
  quickActions: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  actionItem: {
    alignItems: "center",
  },
  actionLabel: {
    color: "#71717a",
    marginTop: 4,
  },
});
