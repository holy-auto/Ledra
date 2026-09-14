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
  const { user, selectedStore, getSelectedStoreId } = useAuthStore();
  const queryClient = useQueryClient();

  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // D-A1 是正 (2026-09-08): サーバの /registers/{id}/open,close は registers.id を
  // path param として要求するが、以前は stores.id を送っていたため register_id の
  // FK 制約に落ちて常に失敗していた（レジ機能が動かない）。この画面にレジ選択 UI は
  // 無い（1店舗＝1レジのモバイルPOS運用を前提）ので、店舗の有効なレジを1件引く。
  const { data: register, isLoading: registerLoading } = useQuery<{ id: string } | null>({
    queryKey: ["register", selectedStore?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registers")
        .select("id")
        .eq("store_id", getSelectedStoreId()!)
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // D-B2 是正 (2026-09-08): 「店舗なしで続行」時は selectedStore が非 null でも
    // id が空文字になり、uuid 列へのクエリが不正な形式で必ず失敗する。
    // 実 store_id が無いときはクエリ自体を起動しない。
    enabled: !!getSelectedStoreId(),
  });

  // code-review 指摘 (2026-09-09): 以前は register_sessions を店舗経由
  // （registers!inner(store_id)）で絞っており、store_id に有効なレジが
  // 複数ある場合、上の register クエリ（sort_order 昇順で1件）とは別の
  // レジの最新セッション（opened_at 降順で1件）を返しうる。結果、画面が
  // 表示するセッションと open/close ミューテーションが叩く register.id が
  // ズレ、無関係なレジのセッションを締めてしまう等の誤操作になる。
  // register クエリが確定した register.id に直接紐付けることで一本化する。
  const {
    data: session,
    isLoading,
    refetch,
  } = useQuery<RegisterSession | null>({
    queryKey: ["register-session", register?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("register_sessions")
        .select("*")
        .eq("register_id", register!.id)
        .eq("tenant_id", user!.tenantId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as RegisterSession;
    },
    enabled: !!register?.id,
  });

  const isOpen = session?.status === "open";

  const openMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(openingCash, 10);
      if (isNaN(amount) || amount < 0) {
        throw new Error("正しい金額を入力してください");
      }
      if (!register) {
        throw new Error("この店舗のレジが見つかりません。管理画面でレジを設定してください");
      }
      return mobileApi(`/registers/${register.id}/open`, {
        method: "POST",
        body: { opening_cash: amount },
      });
    },
    onSuccess: () => {
      setOpeningCash("");
      queryClient.invalidateQueries({
        queryKey: ["register-session", register?.id],
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
      if (!register) {
        throw new Error("この店舗のレジが見つかりません。管理画面でレジを設定してください");
      }
      return mobileApi(`/registers/${register.id}/close`, {
        method: "POST",
        body: { closing_cash: amount },
      });
    },
    onSuccess: () => {
      setClosingCash("");
      queryClient.invalidateQueries({
        queryKey: ["register-session", register?.id],
      });
      setSnackbar("レジを締めました");
    },
    onError: (err) => {
      setSnackbar(
        err instanceof Error ? err.message : "レジ締めに失敗しました"
      );
    },
  });

  // code-review 指摘 (2026-09-08): register クエリと session クエリは並行して
  // 走るが、以前は session 側の isLoading だけで画面をガードしていた。
  // session が先に解決すると、register がまだ取得中でも操作可能になり、
  // その間にレジ開け/締めを押すと register===undefined で
  // 「この店舗のレジが見つかりません」という誤ったエラーが出ていた。
  if (isLoading || registerLoading) {
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
