import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  TextInput,
  Chip,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface RegisterSession {
  id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_sales: number;
  total_transactions: number;
  expected_cash: number;
}

export default function PosRegisterScreen() {
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();

  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [snackbar, setSnackbar] = useState("");

  const {
    data: session,
    isLoading,
    refetch,
  } = useQuery<RegisterSession | null>({
    queryKey: ["register-session", selectedStore?.id],
    queryFn: async () => {
      // register_sessions に店舗は無い。レジ（registers）が店舗を持つので
      // 埋め込みで内部結合して絞る
      const { data, error } = await supabase
        .from("register_sessions")
        .select("*, registers!inner(store_id)")
        .eq("registers.store_id", selectedStore!.id)
        .eq("tenant_id", user!.tenantId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as RegisterSession;
    },
    enabled: !!selectedStore,
  });

  const isOpen = session?.status === "open";

  const openMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(openingCash, 10);
      if (isNaN(amount) || amount < 0) {
        throw new Error("正しい金額を入力してください");
      }
      return mobileApi(`/registers/${selectedStore!.id}/open`, {
        method: "POST",
        body: { opening_cash: amount },
      });
    },
    onSuccess: () => {
      setOpeningCash("");
      queryClient.invalidateQueries({
        queryKey: ["register-session", selectedStore?.id],
      });
      setSnackbar("レジを開けました");
    },
    onError: (err) => {
      setSnackbar(
        err instanceof Error ? err.message : "レジ開けに失敗しました"
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(closingCash, 10);
      if (isNaN(amount) || amount < 0) {
        throw new Error("正しい金額を入力してください");
      }
      return mobileApi(`/registers/${selectedStore!.id}/close`, {
        method: "POST",
        body: { closing_cash: amount },
      });
    },
    onSuccess: () => {
      setClosingCash("");
      queryClient.invalidateQueries({
        queryKey: ["register-session", selectedStore?.id],
      });
      setSnackbar("レジを締めました");
    },
    onError: (err) => {
      setSnackbar(
        err instanceof Error ? err.message : "レジ締めに失敗しました"
      );
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const closingAmount = parseInt(closingCash, 10) || 0;
  const difference = isOpen
    ? closingAmount - (session?.expected_cash ?? 0)
    : 0;

  return (
    <>
      <Stack.Screen options={{ title: "レジ管理" }} />
      <ScrollView style={styles.container}>
        {/* Status Header */}
        <View style={styles.card}>
          <View style={styles.statusHeader}>
            <Chip
              style={{
                backgroundColor: isOpen ? colors.successLight : colors.surfaceVariant,
              }}
              textStyle={{
                color: isOpen ? colors.success : colors.textSecondary,
                fontWeight: "600",
              }}
            >
              {isOpen ? "営業中" : "クローズ"}
            </Chip>
            {isOpen && session && (
              <Text style={styles.subText}>
                開始:{" "}
                {new Date(session.opened_at).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </View>
        </View>

        {!isOpen ? (
          /* Open Register Form */
          <View style={styles.card}>
            <Text style={styles.heading}>
              レジ開け
            </Text>
            <Text style={styles.subText}>
              開始時のレジ内現金を入力してください
            </Text>
            <TextInput
              mode="outlined"
              label="開始現金"
              value={openingCash}
              onChangeText={setOpeningCash}
              keyboardType="numeric"
              style={styles.input}
              right={<TextInput.Affix text="円" />}
            />
            <LedraButton
              icon="cash-register"
              onPress={() => openMutation.mutate()}
              loading={openMutation.isPending}
              disabled={openMutation.isPending || !openingCash}
              style={{ backgroundColor: colors.success }}
            >
              レジ開け
            </LedraButton>
          </View>
        ) : (
          <>
            {/* Session Summary */}
            <View style={styles.card}>
              <Text style={styles.heading}>
                セッション概要
              </Text>
              <View style={styles.summaryRow}>
                <Text style={styles.bodyText}>開始現金</Text>
                <Text style={styles.boldText}>
                  {"¥"}
                  {(session?.opening_cash ?? 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.bodyText}>売上合計</Text>
                <Text style={styles.boldText}>
                  {"¥"}
                  {(session?.total_sales ?? 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.bodyText}>取引数</Text>
                <Text style={styles.boldText}>
                  {session?.total_transactions ?? 0}件
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>
                  想定現金
                </Text>
                <Text style={styles.totalLabel}>
                  {"¥"}
                  {(session?.expected_cash ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Close Register Form */}
            <View style={styles.card}>
              <Text style={styles.heading}>
                レジ締め
              </Text>
              <TextInput
                mode="outlined"
                label="締め現金"
                value={closingCash}
                onChangeText={setClosingCash}
                keyboardType="numeric"
                style={styles.input}
                right={<TextInput.Affix text="円" />}
              />
              {closingCash !== "" && (
                <View style={styles.summaryRow}>
                  <Text style={styles.bodyText}>差額</Text>
                  <Text
                    style={[
                      styles.totalLabel,
                      {
                        color:
                          difference === 0
                            ? colors.success
                            : difference > 0
                              ? colors.primary
                              : colors.danger,
                      },
                    ]}
                  >
                    {difference >= 0 ? "+" : ""}
                    {"¥"}
                    {difference.toLocaleString()}
                  </Text>
                </View>
              )}
              <LedraButton
                variant="danger"
                icon="lock"
                onPress={() => closeMutation.mutate()}
                loading={closeMutation.isPending}
                disabled={closeMutation.isPending || !closingCash}
              >
                レジ締め
              </LedraButton>
            </View>
          </>
        )}

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
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
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  boldText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  totalLabel: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
});
