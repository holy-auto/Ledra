import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Button,
  TextInput,
  Divider,
  ActivityIndicator,
  Chip,
  Snackbar,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

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
      const { data, error } = await supabase
        .from("register_sessions")
        .select("*")
        .eq("store_id", selectedStore!.id)
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
        <Card style={styles.card} mode="outlined">
          <Card.Content style={styles.statusHeader}>
            <Chip
              style={{
                backgroundColor: isOpen ? "#10b98120" : "#71717a20",
              }}
              textStyle={{
                color: isOpen ? "#10b981" : "#71717a",
                fontWeight: "600",
              }}
            >
              {isOpen ? "営業中" : "クローズ"}
            </Chip>
            {isOpen && session && (
              <Text variant="bodySmall" style={styles.subText}>
                開始:{" "}
                {new Date(session.opened_at).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </Card.Content>
        </Card>

        {!isOpen ? (
          /* Open Register Form */
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                レジ開け
              </Text>
              <Text variant="bodyMedium" style={styles.subText}>
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
              <Button
                mode="contained"
                icon="cash-register"
                onPress={() => openMutation.mutate()}
                loading={openMutation.isPending}
                disabled={openMutation.isPending || !openingCash}
                style={styles.submitButton}
                buttonColor="#10b981"
              >
                レジ開け
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            {/* Session Summary */}
            <Card style={styles.card} mode="outlined">
              <Card.Content>
                <Text variant="titleMedium" style={styles.heading}>
                  セッション概要
                </Text>
                <View style={styles.summaryRow}>
                  <Text variant="bodyMedium">開始現金</Text>
                  <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                    {"\u00a5"}
                    {(session?.opening_cash ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="bodyMedium">売上合計</Text>
                  <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                    {"\u00a5"}
                    {(session?.total_sales ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="bodyMedium">取引数</Text>
                  <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                    {session?.total_transactions ?? 0}件
                  </Text>
                </View>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.summaryRow}>
                  <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                    想定現金
                  </Text>
                  <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                    {"\u00a5"}
                    {(session?.expected_cash ?? 0).toLocaleString()}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Close Register Form */}
            <Card style={styles.card} mode="outlined">
              <Card.Content>
                <Text variant="titleMedium" style={styles.heading}>
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
                    <Text variant="bodyMedium">差額</Text>
                    <Text
                      variant="titleSmall"
                      style={{
                        fontWeight: "700",
                        color:
                          difference === 0
                            ? "#10b981"
                            : difference > 0
                              ? "#3b82f6"
                              : "#ef4444",
                      }}
                    >
                      {difference >= 0 ? "+" : ""}
                      {"\u00a5"}
                      {difference.toLocaleString()}
                    </Text>
                  </View>
                )}
                <Button
                  mode="contained"
                  icon="lock"
                  onPress={() => closeMutation.mutate()}
                  loading={closeMutation.isPending}
                  disabled={closeMutation.isPending || !closingCash}
                  style={styles.submitButton}
                  buttonColor="#ef4444"
                >
                  レジ締め
                </Button>
              </Card.Content>
            </Card>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#ffffff",
  },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  subText: { color: "#71717a", marginTop: 4 },
  input: {
    backgroundColor: "#ffffff",
    marginTop: 12,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  submitButton: {
    borderRadius: 8,
    marginTop: 4,
  },
});
