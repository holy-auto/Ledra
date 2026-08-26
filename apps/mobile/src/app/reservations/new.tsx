import { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  TextInput,
  Chip,
  Searchbar,
  List,
  Snackbar,
} from "react-native-paper";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Steps } from "@/components/Steps";
import {
  reservationSteps,
  reservationCurrentStep,
} from "@/lib/reservationSteps";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { padToColumns } from "@/lib/menuFilter";
import {
  useMenuFilter,
  MenuFilterBar,
  MenuTile,
  MenuTileSpacer,
} from "@/components/MenuPicker";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";
import { useMenuItems } from "@/hooks/useMenuItems";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  unit_price: number;
  category_large: string | null;
}

type ReservationType = "scheduled" | "walk_in";

export default function ReservationNewScreen() {
  const { user, selectedStore } = useAuthStore();
  const { width: windowWidth } = useWindowDimensions();
  // クイック作成の「作業開始（ウォークイン入庫）」から飛び込みを初期選択して開く
  const { type } = useLocalSearchParams<{ type?: string }>();

  const [reservationType, setReservationType] = useState<ReservationType>(
    type === "walk_in" ? "walk_in" : "scheduled",
  );
  // useLocalSearchParams は遷移直後の初回描画で空を返すことがある。
  // useState の初期値だけに頼ると飛び込み指定が黙って落ちるので追随させる
  useEffect(() => {
    if (type === "walk_in") setReservationType("walk_in");
  }, [type]);

  // Form state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedMenuItems, setSelectedMenuItems] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // Customer search
  const { data: customers = [], isFetching: searchingCustomers } = useQuery<Customer[]>({
    queryKey: ["customers-search", customerSearch],
    queryFn: async () => {
      if (!customerSearch || customerSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("tenant_id", user!.tenantId)
        .ilike("name", `%${customerSearch}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: customerSearch.length >= 2 && !selectedCustomer,
  });

  // Vehicles for selected customer
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["customer-vehicles", selectedCustomer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate_display, maker, model")
        .eq("customer_id", selectedCustomer!.id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCustomer,
  });

  // Menu items
  const { data: menuItems = [] } = useMenuItems();

  // Submit
  const createMutation = useMutation({
    mutationFn: async () => {
      if (selectedMenuItems.length === 0) {
        throw new Error("メニューを1つ以上選択してください");
      }

      const isWalkIn = reservationType === "walk_in";
      const now = new Date();

      // toISOString() は UTC を返すため、時刻がローカルなのに日付だけ前日になる
      // （JST 09:00 前の受付が全部前日に入る）。ローカル日付で揃える
      const scheduledDate = isWalkIn
        ? dayjs(now).format("YYYY-MM-DD")
        : dayjs(selectedDate).format("YYYY-MM-DD");
      const scheduledTime = isWalkIn
        ? now.toTimeString().slice(0, 5)
        : selectedDate.toTimeString().slice(0, 5);

      const items = selectedMenuItems.map((menuItemId) => {
        const mi = menuItems.find((m) => m.id === menuItemId);
        return {
          menu_item_id: menuItemId,
          name: mi?.name ?? "メニュー",
          price: mi?.unit_price ?? 0,
        };
      });

      const estimatedAmount = items.reduce((sum, item) => sum + item.price, 0);

      const { data, error } = await supabase
        .from("reservations")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          customer_id: selectedCustomer?.id ?? null,
          vehicle_id: selectedVehicle?.id ?? null,
          title: items[0]?.name ?? "予約",
          scheduled_date: scheduledDate,
          start_time: scheduledTime,
          status: isWalkIn ? "arrived" : "confirmed",
          payment_status: "unpaid",
          note: notes || null,
          estimated_amount: estimatedAmount,
          menu_items_json: items,
        })
        .select("id")
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: (data) => {
      router.replace(`/reservations/${data.id}`);
    },
    onError: (err) => {
      setSnackbar(err instanceof Error ? err.message : "作成に失敗しました");
    },
  });

  // 会計画面と同じ検索・カテゴリ絞り込み（components/MenuPicker）
  const {
    search: menuSearch,
    setSearch: setMenuSearch,
    categories,
    activeCategory,
    changeCategory,
    filtered: filteredMenu,
  } = useMenuFilter(menuItems);

  // ponytail: この画面はフォーム全体が1つの ScrollView なので、グリッドは
  // 仮想化せず素の View で描く。代わりに初期表示を打ち切って「すべて表示」を出す。
  // 上限: 全件表示にすると品目数ぶんの View を一度に作る。数百件規模になったら
  // 会計画面と同じ FlatList 化が必要。
  const VISIBLE_LIMIT = 12;
  const [showAllMenu, setShowAllMenu] = useState(false);
  const visibleMenu = showAllMenu ? filteredMenu : filteredMenu.slice(0, VISIBLE_LIMIT);
  const menuColumns = windowWidth >= 700 ? 4 : windowWidth >= 500 ? 3 : 2;
  const menuRows = useMemo(() => {
    const padded = padToColumns(visibleMenu, menuColumns);
    const rows: (MenuItem | null)[][] = [];
    for (let i = 0; i < padded.length; i += menuColumns) {
      rows.push(padded.slice(i, i + menuColumns));
    }
    return rows;
  }, [visibleMenu, menuColumns]);

  function toggleMenuItem(id: string) {
    setSelectedMenuItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const total = selectedMenuItems.reduce((sum, id) => {
    const mi = menuItems.find((m) => m.id === id);
    return sum + (mi?.unit_price ?? 0);
  }, 0);

  const isWalkIn = reservationType === "walk_in";

  // 入力進捗インジケーター用のステップ状態を導出
  const stepDefs = reservationSteps(reservationType);
  const currentStep = reservationCurrentStep({
    mode: reservationType,
    hasCustomer: !!selectedCustomer,
    hasVehicle: !!selectedVehicle,
    hasMenu: selectedMenuItems.length > 0,
  });

  return (
    <>
      <Stack.Screen options={{ title: isWalkIn ? "飛び込み受付" : "予約作成" }} />
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* 入力進捗 */}
        <View style={styles.card}>
          <Steps steps={stepDefs} current={currentStep} />
        </View>

        {/* 予約タイプ */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            受付タイプ
          </Text>
          <SegmentedControl
            segments={[
              { value: "scheduled", label: "予約" },
              { value: "walk_in", label: "飛び込み" },
            ]}
            value={reservationType}
            onChange={(v) => setReservationType(v as ReservationType)}
          />
        </View>

        {/* Customer Picker */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.heading}>
              顧客
            </Text>
            {isWalkIn && (
              <Chip compact style={styles.optionalChip}>
                <Text style={styles.optionalText}>任意</Text>
              </Chip>
            )}
          </View>
          {selectedCustomer ? (
            <View style={styles.selectedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>
                  {selectedCustomer.name}
                </Text>
                {selectedCustomer.phone && (
                  <Text style={styles.subText}>
                    {selectedCustomer.phone}
                  </Text>
                )}
              </View>
              <LedraButton
                variant="ghost"
                size="small"
                fullWidth={false}
                onPress={() => {
                  setSelectedCustomer(null);
                  setSelectedVehicle(null);
                  setCustomerSearch("");
                }}
              >
                変更
              </LedraButton>
            </View>
          ) : (
            <>
              <Searchbar
                placeholder="顧客名で検索..."
                value={customerSearch}
                onChangeText={setCustomerSearch}
                loading={searchingCustomers}
                style={styles.searchbar}
              />
              {customers.map((c) => (
                <List.Item
                  key={c.id}
                  title={c.name}
                  description={c.phone ?? ""}
                  onPress={() => {
                    setSelectedCustomer(c);
                    setCustomerSearch(c.name);
                  }}
                  left={(props) => <List.Icon {...props} icon="account" />}
                />
              ))}
            </>
          )}
        </View>

        {/* Vehicle Picker */}
        {selectedCustomer && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.heading}>
                車両
              </Text>
              {isWalkIn && (
                <Chip compact style={styles.optionalChip}>
                  <Text style={styles.optionalText}>任意</Text>
                </Chip>
              )}
            </View>
            {vehicles.length === 0 ? (
              <Text style={styles.subText}>
                この顧客の車両がありません
              </Text>
            ) : (
              vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setSelectedVehicle(v)}
                  style={[
                    styles.vehicleOption,
                    selectedVehicle?.id === v.id && styles.vehicleSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.bodyText,
                      selectedVehicle?.id === v.id && { fontWeight: "700" },
                    ]}
                  >
                    {v.plate_display ?? "ナンバー未登録"}
                  </Text>
                  <Text style={styles.subText}>
                    {[v.maker, v.model].filter(Boolean).join(" ")}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Date/Time Picker（予約モードのみ） */}
        {!isWalkIn && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              日時
            </Text>
            <View style={styles.dateRow}>
              <LedraButton
                variant="outline"
                icon="calendar"
                onPress={() => setShowDatePicker(true)}
                style={{ flex: 1, marginRight: spacing.sm }}
                fullWidth={false}
              >
                {selectedDate.toLocaleDateString("ja-JP")}
              </LedraButton>
              <LedraButton
                variant="outline"
                icon="clock-outline"
                onPress={() => setShowTimePicker(true)}
                style={{ flex: 1 }}
                fullWidth={false}
              >
                {selectedDate.toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </LedraButton>
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                // 既定は端末ロケール。英語だと "Aug" 等になり分かりにくいので
                // 日本語（数字の年月日）に固定する。
                // ponytail: locale は iOS 専用の prop（Android の型には無く、
                // union 型なので tsc も警告しない）。Android は端末の言語設定に従うため、
                // 英語設定の Android では依然 "Aug" のまま。直すには
                // AppCompatDelegate.setApplicationLocales 相当のネイティブ設定が必要で
                // EAS 再ビルドを伴う。実機検証は iOS 中心なので今は iOS のみ対応。
                locale="ja-JP"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) setSelectedDate(date);
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="time"
                locale="ja-JP"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowTimePicker(false);
                  if (date) setSelectedDate(date);
                }}
              />
            )}
          </View>
        )}

        {/* 飛び込みモード情報 */}
        {isWalkIn && (
          <View style={styles.walkInInfoCard}>
            <Text style={styles.walkInInfoText}>
              本日の日時で「来店済」ステータスとして登録されます
            </Text>
          </View>
        )}

        {/* Menu Items Multi-select */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            メニュー
          </Text>
          <MenuFilterBar
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={changeCategory}
            search={menuSearch}
            onSearchChange={setMenuSearch}
          />
          <View style={styles.menuGrid}>
            {menuRows.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.menuRow}>
                {row.map((mi, ci) =>
                  mi ? (
                    <MenuTile
                      key={mi.id}
                      name={mi.name}
                      price={mi.unit_price}
                      selected={selectedMenuItems.includes(mi.id)}
                      onPress={() => toggleMenuItem(mi.id)}
                    />
                  ) : (
                    <MenuTileSpacer key={`pad-${ri}-${ci}`} />
                  ),
                )}
              </View>
            ))}
          </View>
          {menuItems.length === 0 && (
            <Text style={styles.subText}>メニューが未登録です</Text>
          )}
          {menuItems.length > 0 && filteredMenu.length === 0 && (
            <Text style={styles.subText}>該当するメニューがありません</Text>
          )}
          {!showAllMenu && filteredMenu.length > VISIBLE_LIMIT && (
            <Pressable
              onPress={() => setShowAllMenu(true)}
              style={styles.moreButton}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>
                すべて表示（あと{filteredMenu.length - VISIBLE_LIMIT}件）
              </Text>
            </Pressable>
          )}
          {selectedMenuItems.length > 0 && (
            <Text style={styles.menuTotal}>
              合計: ¥{total.toLocaleString()}
            </Text>
          )}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            備考
          </Text>
          <TextInput
            mode="outlined"
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
            placeholder="メモを入力..."
          />
        </View>

        {/* Submit */}
        <View style={styles.submitArea}>
          <LedraButton
            icon={isWalkIn ? "walk" : "check"}
            onPress={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={
              createMutation.isPending ||
              selectedMenuItems.length === 0 ||
              (!isWalkIn && (!selectedCustomer || !selectedVehicle))
            }
          >
            {isWalkIn ? "飛び込み受付を作成" : "予約を作成"}
          </LedraButton>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  menuGrid: { gap: spacing.sm, marginTop: spacing.sm },
  menuRow: { flexDirection: "row", gap: spacing.sm },
  moreButton: { paddingVertical: spacing.md, alignItems: "center" },
  moreText: { ...typography.label, color: colors.primary },
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  optionalChip: { backgroundColor: colors.surfaceVariant },
  optionalText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  customerName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchbar: {
    backgroundColor: colors.surfaceVariant,
    elevation: 0,
  },
  vehicleOption: {
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  vehicleSelected: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.infoLight,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  walkInInfoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadows.card,
  },
  walkInInfoText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  chip: {
    marginBottom: spacing.xs,
  },
  menuTotal: {
    ...typography.titleSmall,
    marginTop: spacing.md,
    textAlign: "right",
    color: colors.textPrimary,
  },
  submitArea: {
    padding: spacing.lg,
  },
});
