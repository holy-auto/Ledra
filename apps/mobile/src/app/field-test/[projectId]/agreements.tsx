import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Alert, Linking, ScrollView } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Agreement = {
  id: string;
  agreement_type: string;
  document_url: string | null;
  document_text: string | null;
  accepted: boolean;
  accepted_at: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "その他",
};

const TYPE_ICONS: Record<string, string> = {
  nda: "shield-lock-outline",
  terms: "file-document-outline",
  other: "file-outline",
};

export default function AgreementsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ft-agreements", user?.tenantId, projectId],
    queryFn: () =>
      mobileApi<{ agreements: Agreement[] }>(`/field-test/agreements?project_id=${projectId}`),
    enabled: !!user?.tenantId && !!projectId,
  });

  const agreements = data?.agreements ?? [];

  const handleAccept = useCallback(
    async (agreementId: string) => {
      Alert.alert("確認", "この契約に同意しますか？", [
        { text: "キャンセル", style: "cancel" },
        {
          text: "同意する",
          onPress: async () => {
            setAccepting(agreementId);
            try {
              await mobileApi(`/field-test/agreements/${agreementId}`, {
                method: "PATCH",
                body: { action: "accept" },
              });
              queryClient.invalidateQueries({ queryKey: ["ft-agreements"] });
              Alert.alert("完了", "同意しました");
            } catch (e: unknown) {
              Alert.alert("エラー", e instanceof Error ? e.message : "同意処理に失敗しました");
            } finally {
              setAccepting(null);
            }
          },
        },
      ]);
    },
    [queryClient],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={agreements}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const iconName = TYPE_ICONS[item.agreement_type] ?? "file-outline";
          return (
            <View style={[styles.card, item.accepted ? styles.cardAccepted : styles.cardPending]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, item.accepted && styles.iconWrapAccepted]}>
                  <Icon
                    source={item.accepted ? "check-circle" : iconName}
                    size={22}
                    color={item.accepted ? colors.success : colors.primary}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.title}>
                    {TYPE_LABELS[item.agreement_type] ?? item.agreement_type}
                  </Text>
                  {item.accepted ? (
                    <Text style={styles.statusAccepted}>
                      同意済 ({item.accepted_at?.slice(0, 10)})
                    </Text>
                  ) : (
                    <Text style={styles.statusPending}>未同意</Text>
                  )}
                </View>
              </View>

              {item.document_text && (
                <ScrollView style={styles.docBox} nestedScrollEnabled>
                  <Text style={styles.docText}>{item.document_text}</Text>
                </ScrollView>
              )}

              {item.document_url && (
                <Pressable
                  style={styles.docLink}
                  onPress={() => Linking.openURL(item.document_url!)}
                >
                  <Icon source="open-in-new" size={14} color={colors.primary} />
                  <Text style={styles.docLinkText}>契約書を開く</Text>
                </Pressable>
              )}

              {!item.accepted && (
                <View style={styles.actionRow}>
                  <Button
                    mode="contained"
                    onPress={() => handleAccept(item.id)}
                    loading={accepting === item.id}
                    disabled={accepting !== null}
                    style={styles.acceptBtn}
                    labelStyle={styles.acceptBtnLabel}
                  >
                    同意する
                  </Button>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="file-document-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>契約書はありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardAccepted: {
    borderWidth: 1,
    borderColor: colors.success + "40",
    backgroundColor: colors.success + "08",
  },
  cardPending: {
    borderWidth: 1,
    borderColor: "#F59E0B40",
    backgroundColor: "#FFFBEB",
  },
  cardHeader: { flexDirection: "row", gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapAccepted: {
    backgroundColor: colors.success + "18",
  },
  cardText: { flex: 1 },
  title: { ...typography.titleSmall, color: colors.textPrimary },
  statusAccepted: { ...typography.meta, color: colors.success, marginTop: 2 },
  statusPending: { ...typography.meta, color: "#D97706", marginTop: 2 },
  docBox: {
    marginTop: spacing.md,
    maxHeight: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  docText: { ...typography.bodySmall, color: colors.textSecondary },
  docLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  docLinkText: { ...typography.meta, color: colors.primary },
  actionRow: { marginTop: spacing.md },
  acceptBtn: { borderRadius: radius.md },
  acceptBtnLabel: { fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
});
