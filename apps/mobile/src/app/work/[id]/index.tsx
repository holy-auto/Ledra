import { useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Alert,
  Pressable,
} from "react-native";
import {
  Text,
  Icon,
  TextInput,
  Snackbar,
  ActivityIndicator,
  Dialog,
  Portal,
  Checkbox,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { parseMenuItems, menuItemsTotal } from "@/lib/reservationItems";
import { confirmationState } from "@/lib/confirmationState";
import { useAuthStore } from "@/stores/authStore";
import {
  ProgressRing,
  NextActionCard,
  StatusBadge,
  LedraButton,
} from "@/components/ui";
import { Steps } from "@/components/Steps";
import {
  colors,
  spacing,
  radius,
  typography,
  shadows,
} from "@/constants/tokens";

interface WorkOrder {
  id: string;
  status: string;
  sub_status: string | null;
  progress_note: string | null;
  scheduled_date: string;
  start_time: string | null;
  customer: {
    name: string;
    phone: string | null;
  } | null;
  vehicle: {
    id: string;
    plate_display: string;
    maker: string | null;
    model: string | null;
  } | null;
  menu_items_json: unknown;
}

interface WorkPhoto {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
}

const STATUS_SEVERITY: Record<string, "warning" | "info" | "success" | "neutral"> = {
  arrived: "warning",
  in_progress: "info",
  completed: "success",
};

const STATUS_LABELS: Record<string, string> = {
  arrived: "来店済み",
  in_progress: "作業中",
  completed: "完了",
};

// ponytail: mock steps for the stepper — real step data would come from
// a work_steps table (IMP-020 scope). Good enough for visual structure.
const WORK_STEPS = [
  { label: "入庫確認" },
  { label: "施工前確認" },
  { label: "洗車" },
  { label: "施工" },
  { label: "最終確認" },
];

/** Tab keys for detail sub-sections */
type TabKey = "overview" | "work" | "evidence" | "docs" | "history";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview", label: "概要", icon: "text-box-outline" },
  { key: "work", label: "作業", icon: "wrench-outline" },
  { key: "evidence", label: "証拠", icon: "camera-outline" },
  { key: "docs", label: "書類", icon: "file-document-outline" },
  { key: "history", label: "履歴", icon: "history" },
];

export default function WorkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [subStatus, setSubStatus] = useState("");
  const [progressNote, setProgressNote] = useState("");
  /** 使用部品・資材の追加ダイアログ */
  const [partsVisible, setPartsVisible] = useState(false);
  const [addingIds, setAddingIds] = useState<string[]>([]);
  /** お客様確認の詳細ダイアログ */
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const { data: work, isLoading } = useQuery<WorkOrder>({
    queryKey: ["work-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id, status, sub_status, progress_note, scheduled_date, start_time,
          customer:customers(name, phone),
          vehicle:vehicles(id, plate_display, maker, model),
          menu_items_json
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const wo = data as unknown as WorkOrder;
      setSubStatus(wo.sub_status ?? "");
      setProgressNote(wo.progress_note ?? "");
      return wo;
    },
    enabled: !!id,
  });

  const { data: certId } = useQuery({
    queryKey: ["work-certificate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("id")
        .eq("reservation_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
    enabled: !!id && !!user?.tenantId,
  });

  /**
   * お客様確認の進捗。**「未確認」のベタ書きをやめて実データを出す。**
   * 届いたのか（notification_sent_at）／確認されたのか（signed_at）が
   * 分からないと、催促していいのかどうかが判断できない。
   */
  const { data: confirmation } = useQuery({
    queryKey: ["work-confirmation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_sessions")
        .select("id, status, notification_sent_at, signed_at, remind_count, last_reminded_at, notified_channel, expires_at")
        .eq("reservation_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user?.tenantId,
  });

  /** 追加できる品目。予約作成画面と同じ条件で引く */
  const { data: menuItems = [] } = useQuery<{ id: string; name: string; unit_price: number; category_large: string | null }[]>({
    queryKey: ["menu-items-work", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, unit_price, category_large")
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.tenantId && partsVisible,
  });

  const { data: photos = [] } = useQuery<WorkPhoto[]>({
    queryKey: ["work-photos", certId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_images")
        .select("id, storage_path, thumbnail_path")
        .eq("certificate_id", certId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkPhoto[];
    },
    enabled: !!certId,
  });

  function goToPhotos() {
    if (certId) {
      router.push(`/certificates/${certId}/photos`);
    } else {
      Alert.alert(
        "証明書が必要です",
        "施工写真は証明書に紐づけて保存します。先に証明書を作成してください。",
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "証明書を作成",
            onPress: () =>
              router.push(`/certificates/new?reservationId=${id}`),
          },
        ]
      );
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("reservations")
        .update({
          sub_status: subStatus || null,
          progress_note: progressNote || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", id] });
      setSnackbar("更新しました");
    },
    onError: () => setSnackbar("更新に失敗しました"),
  });

  /**
   * 使用部品・資材を**この案件に追加する**。予約作成時にしか書けなかったので、
   * 現場で「1つ足りない」に気づいても直せなかった。
   * 既存の明細に足す（置き換えない）。見積額も足した分だけ引き上げる。
   */
  const addPartsMutation = useMutation({
    mutationFn: async () => {
      // **既存行は正規化せずそのまま残す。** parseMenuItems の戻り値で
      // 上書きすると保存形が変わり、他の読み手（Web・集計）が壊れる
      const existing = Array.isArray(work?.menu_items_json) ? (work.menu_items_json as unknown[]) : [];
      const added = addingIds.map((mid) => {
        const mi = menuItems.find((m) => m.id === mid);
        return { menu_item_id: mid, name: mi?.name ?? "メニュー", price: mi?.unit_price ?? 0 };
      });
      const next = [...existing, ...added];
      const { error } = await supabase
        .from("reservations")
        .update({
          menu_items_json: next,
          // 合計は正準のパーサに任せる（単価不明の行の扱いを1箇所に寄せる）
          estimated_amount: menuItemsTotal(parseMenuItems(next)),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", id] });
      setAddingIds([]);
      setPartsVisible(false);
      setSnackbar("追加しました");
    },
    onError: () => setSnackbar("追加に失敗しました"),
  });

  const confirm = confirmationState(confirmation);
  const confirmState = {
    label: confirm.label,
    color:
      confirm.tone === "done"
        ? colors.success
        : confirm.tone === "problem"
          ? colors.danger
          : confirm.tone === "waiting"
            ? colors.warning
            : colors.textSecondary,
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["work-order", id] });
      await queryClient.invalidateQueries({
        queryKey: ["work-certificate", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["work-photos", certId],
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, id, certId]);

  // ponytail: derive step index from status — real impl would use work_steps table
  const currentStep =
    work?.status === "completed"
      ? WORK_STEPS.length
      : work?.status === "in_progress"
        ? 3
        : 1;

  // ponytail: progress percentage — mock based on step
  const progressPercent = Math.round((currentStep / WORK_STEPS.length) * 100);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!work) {
    return (
      <View style={styles.center}>
        <Icon source="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={{ ...typography.body, color: colors.textSecondary, marginTop: spacing.md }}>
          作業が見つかりません
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "作業詳細" }} />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Vehicle Hero Card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <View style={styles.vehicleThumb}>
              <Icon source="car" size={32} color={colors.primary} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroMake}>
                {work.vehicle?.maker ?? ""} {work.vehicle?.model ?? ""}
              </Text>
              <Text style={styles.heroPlate}>
                {work.vehicle?.plate_display ?? "車両不明"}
              </Text>
              <View style={styles.heroMeta}>
                <Icon source="calendar-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.heroMetaText}>
                  納車 {work.start_time?.slice(0, 5) ?? "--:--"}
                </Text>
              </View>
            </View>
            <ProgressRing
              progress={progressPercent / 100}
              size={64}
              strokeWidth={5}
              label={`${progressPercent}%`}
              sublabel="全体の進捗"
            />
          </View>
        </View>

        {/* ── NEXT ACTION ── */}
        <View style={styles.section}>
          <NextActionCard
            title={
              photos.length === 0
                ? "施工写真を撮影"
                : work.status === "in_progress"
                  ? "施工を完了する"
                  : "作業を開始する"
            }
            reason={
              photos.length === 0
                ? `残り ${5 - photos.length} 枚`
                : undefined
            }
            icon={photos.length === 0 ? "camera" : "check-circle-outline"}
            onPress={photos.length === 0 ? goToPhotos : () => {}}
          />
        </View>

        {/* ── Step Progress ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>作業の進捗</Text>
          <Steps steps={WORK_STEPS} current={currentStep} />
        </View>

        {/* ── Tab Navigation ── */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.tabActive,
              ]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab.key && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Tab Content ── */}
        {activeTab === "overview" && (
          <>
            {/* Quick Info Cards */}
            <View style={styles.quickInfoRow}>
              <Pressable style={styles.quickInfoCard} onPress={() => setPartsVisible(true)}>
                <Icon source="wrench" size={20} color={colors.primary} />
                <Text style={styles.quickInfoLabel}>使用部品・資材</Text>
                <Text style={styles.quickInfoValue}>
                  {parseMenuItems(work.menu_items_json).length}点
                </Text>
                <Icon source="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>

              <Pressable style={styles.quickInfoCard} onPress={() => setConfirmVisible(true)}>
                <Icon source="account-check-outline" size={20} color={colors.primary} />
                <Text style={styles.quickInfoLabel}>お客様確認</Text>
                <Text style={[styles.quickInfoValue, { color: confirmState.color }]}>
                  {confirmState.label}
                </Text>
                <Icon source="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>

              {/* 備考は**空でも開く**。書き足すためにこそ開きたい */}
              <Pressable style={styles.quickInfoCard} onPress={() => setActiveTab("work")}>
                <Icon source="note-text-outline" size={20} color={colors.primary} />
                <Text style={styles.quickInfoLabel}>備考</Text>
                <Text style={styles.quickInfoValue}>
                  {progressNote ? "1件" : "なし"}
                </Text>
                <Icon source="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Service Items */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>施工内容</Text>
              {parseMenuItems(work.menu_items_json).map((mi, i) => (
                <View key={`${mi.menu_item_id ?? mi.name}-${i}`} style={styles.serviceRow}>
                  <Icon source="checkbox-marked-circle-outline" size={18} color={colors.success} />
                  <Text style={styles.serviceItemText}>{mi.name}</Text>
                </View>
              ))}
              {parseMenuItems(work.menu_items_json).length === 0 && (
                <Text style={styles.emptyText}>施工項目はありません</Text>
              )}
            </View>

            {/* Customer Info */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>顧客情報</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>お名前</Text>
                <Text style={styles.infoValue}>
                  {work.customer?.name ?? "未登録"}
                </Text>
              </View>
              {work.customer?.phone && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>電話番号</Text>
                  <Text style={styles.infoValue}>{work.customer.phone}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>予約日</Text>
                <Text style={styles.infoValue}>{work.scheduled_date}</Text>
              </View>
            </View>
          </>
        )}

        {activeTab === "work" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>作業メモ</Text>
            <TextInput
              mode="outlined"
              label="サブステータス"
              value={subStatus}
              onChangeText={setSubStatus}
              style={styles.input}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />
            <TextInput
              mode="outlined"
              label="進捗メモ"
              value={progressNote}
              onChangeText={setProgressNote}
              multiline
              numberOfLines={3}
              style={styles.input}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />
            <LedraButton
              variant="primary"
              icon="content-save"
              onPress={() => updateMutation.mutate()}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              保存
            </LedraButton>
          </View>
        )}

        {activeTab === "evidence" && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>施工写真</Text>
              <StatusBadge
                label={`${photos.length}枚`}
                severity={photos.length > 0 ? "success" : "neutral"}
              />
            </View>
            {photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{
                      uri: supabase.storage
                        .from("assets")
                        .getPublicUrl(
                          photo.thumbnail_path ?? photo.storage_path
                        ).data.publicUrl,
                    }}
                    style={styles.photoThumb}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>まだ写真がありません</Text>
            )}
            <LedraButton
              variant="primary"
              icon="camera"
              onPress={goToPhotos}
              style={{ marginTop: spacing.lg }}
            >
              撮影する
            </LedraButton>
          </View>
        )}

        {activeTab === "docs" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>関連書類</Text>
            {certId ? (
              <Pressable
                style={styles.docRow}
                onPress={() => router.push(`/certificates/${certId}`)}
              >
                <Icon source="certificate" size={20} color={colors.primary} />
                <Text style={styles.docText}>施工証明書</Text>
                <Icon source="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            ) : (
              <Text style={styles.emptyText}>
                関連する書類はまだありません
              </Text>
            )}
          </View>
        )}

        {activeTab === "history" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>作業履歴</Text>
            <View style={styles.historyItem}>
              <View style={styles.historyDot} />
              <View>
                <Text style={styles.historyText}>
                  ステータス: {STATUS_LABELS[work.status] ?? work.status}
                </Text>
                <Text style={styles.historyTime}>{work.scheduled_date}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Bottom action */}
        <View style={styles.bottomActions}>
          <LedraButton
            variant="outline"
            icon="bullhorn"
            onPress={() => router.push(`/work/${id}/progress`)}
          >
            進捗を更新
          </LedraButton>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Portal>
        {/* 使用部品・資材を後から足す。予約作成時にしか書けなかった */}
        <Dialog visible={partsVisible} onDismiss={() => setPartsVisible(false)}>
          <Dialog.Title>使用部品・資材</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <Text style={styles.dialogSectionLabel}>この案件の明細</Text>
              {parseMenuItems(work.menu_items_json).length === 0 ? (
                <Text style={styles.dialogEmpty}>まだありません</Text>
              ) : (
                parseMenuItems(work.menu_items_json).map((mi, i) => (
                  <Text key={`${mi.menu_item_id ?? mi.name}-${i}`} style={styles.dialogRow}>
                    ・{mi.name}
                    {mi.amount != null ? `　¥${mi.amount.toLocaleString()}` : "　（金額不明）"}
                  </Text>
                ))
              )}

              <Text style={styles.dialogSectionLabel}>追加する</Text>
              {menuItems.length === 0 ? (
                <Text style={styles.dialogEmpty}>品目を読み込んでいます...</Text>
              ) : (
                menuItems.map((m) => (
                  <Checkbox.Item
                    key={m.id}
                    label={`${m.name}　¥${(m.unit_price ?? 0).toLocaleString()}`}
                    status={addingIds.includes(m.id) ? "checked" : "unchecked"}
                    onPress={() =>
                      setAddingIds((prev) =>
                        prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                      )
                    }
                  />
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Pressable onPress={() => setPartsVisible(false)} style={styles.dialogBtn}>
              <Text style={styles.dialogBtnText}>閉じる</Text>
            </Pressable>
            <Pressable
              onPress={() => addPartsMutation.mutate()}
              disabled={addingIds.length === 0 || addPartsMutation.isPending}
              style={styles.dialogBtn}
            >
              <Text
                style={[
                  styles.dialogBtnText,
                  { color: addingIds.length === 0 ? colors.textTertiary : colors.primary },
                ]}
              >
                {addingIds.length > 0 ? `${addingIds.length}件を追加` : "追加"}
              </Text>
            </Pressable>
          </Dialog.Actions>
        </Dialog>

        {/* お客様確認の進捗。「送っていない」と「届いたが未確認」を分けて出す */}
        <Dialog visible={confirmVisible} onDismiss={() => setConfirmVisible(false)}>
          <Dialog.Title>お客様確認</Dialog.Title>
          <Dialog.Content>
            <Text style={[styles.dialogStatus, { color: confirmState.color }]}>{confirm.label}</Text>
            <Text style={styles.dialogRow}>{confirm.detail}</Text>
            {confirmation?.notification_sent_at && (
              <Text style={styles.dialogRow}>
                送信: {dayjs(confirmation.notification_sent_at).format("M/D HH:mm")}
                {confirmation.notified_channel ? `（${confirmation.notified_channel}）` : ""}
              </Text>
            )}
            {confirmation?.signed_at && (
              <Text style={styles.dialogRow}>
                確認: {dayjs(confirmation.signed_at).format("M/D HH:mm")}
              </Text>
            )}
            {!!confirmation?.remind_count && (
              <Text style={styles.dialogRow}>
                催促: {confirmation.remind_count}回
                {confirmation.last_reminded_at
                  ? `（最終 ${dayjs(confirmation.last_reminded_at).format("M/D HH:mm")}）`
                  : ""}
              </Text>
            )}
            {/* ponytail: 上限。開封は記録していないので「読んだか」までは出せない */}
            <Text style={styles.dialogNote}>
              お客様が開いたかどうかは記録していないため分かりません。
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Pressable onPress={() => setConfirmVisible(false)} style={styles.dialogBtn}>
              <Text style={styles.dialogBtnText}>閉じる</Text>
            </Pressable>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero card
  heroCard: {
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.hero,
    padding: spacing.lg,
    ...shadows.card,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  vehicleThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroMake: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  heroPlate: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroMetaText: {
    ...typography.meta,
    color: colors.textTertiary,
  },

  // Section
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xs,
    ...shadows.card,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.textOnPrimary,
  },

  // Quick info
  quickInfoRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  quickInfoCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
    ...shadows.card,
  },
  quickInfoLabel: {
    ...typography.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  quickInfoValue: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },

  // Service items
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  serviceItemText: {
    ...typography.body,
    color: colors.textPrimary,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: "600",
  },

  // Photos
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
  },

  // Docs
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  docText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },

  // History
  historyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  historyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  historyTime: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Input
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },

  // Bottom
  bottomActions: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },

  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  dialogScroll: { maxHeight: 420 },
  dialogSectionLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  dialogEmpty: { ...typography.bodySmall, color: colors.textTertiary },
  dialogRow: { ...typography.bodySmall, color: colors.textPrimary, marginBottom: spacing.xs },
  dialogStatus: { ...typography.titleMedium, marginBottom: spacing.sm },
  dialogNote: { ...typography.meta, color: colors.textTertiary, marginTop: spacing.md },
  dialogBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dialogBtnText: { ...typography.label, color: colors.primary },
});
