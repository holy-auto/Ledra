import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Text, Card, IconButton } from "react-native-paper";
import { router } from "expo-router";

import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

interface DashboardStats {
  todayReservations: number;
  activeWork: number;
  awaitingPayment: number;
  todayPayments: number;
}

export default function HomeScreen() {
  const { user, selectedStore } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    todayReservations: 0,
    activeWork: 0,
    awaitingPayment: 0,
    todayPayments: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  async function loadStats() {
    if (!user?.tenantId || !selectedStore?.id) return;

    const today = new Date().toISOString().split("T")[0];

    const [reservations, work, awaitingPay, payments] = await Promise.all([
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
    ]);

    setStats({
      todayReservations: reservations.count ?? 0,
      activeWork: work.count ?? 0,
      awaitingPayment: awaitingPay.count ?? 0,
      todayPayments: payments.count ?? 0,
    });
  }

  useEffect(() => {
    loadStats();
  }, [user?.tenantId, selectedStore?.id]);

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
        />
      </View>

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
    <Card style={styles.statCard} onPress={onPress} mode="outlined">
      <Card.Content style={styles.statContent}>
        <IconButton icon={icon} iconColor={color} size={24} style={{ margin: 0 }} />
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
