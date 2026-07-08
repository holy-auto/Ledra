import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  Card,
  Chip,
  Searchbar,
  ActivityIndicator,
  List,
  Snackbar,
  SegmentedButtons,
} from "react-native-paper";
import { router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

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
}

type ReservationType = "scheduled" | "walk_in";

export default function ReservationNewScreen() {
  const { user, selectedStore } = useAuthStore();

  const [reservationType, setReservationType] = useState<ReservationType>("scheduled");

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
  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu-items-res", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, unit_price")
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.tenantId,
  });

  // Submit
  const createMutation = useMutation({
    mutationFn: async () => {
      if (selectedMenuItems.length === 0) {
        throw new Error("メニューを1つ以上選択してください");
      }

      const isWalkIn = reservationType === "walk_in";
      const now = new Date();

      const scheduledDate = isWalkIn
        ? now.toISOString().split("T")[0]
        : selectedDate.toISOString().split("T")[0];
      const scheduledTime = isWalkIn
        ? now.toTimeString().slice(0, 5)
        : selectedDate.toTimeString().slice(0, 5);

      // reservations.menu_items_json (Web 側と同じ shape: { menu_item_id, name, price })
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

  return (
    <>
      <Stack.Screen options={{ title: isWalkIn ? "飛び込み受付" : "予約作成" }} />
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* 予約タイプ */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              受付タイプ
            </Text>
            <SegmentedButtons
              value={reservationType}
              onValueChange={(v) => setReservationType(v as ReservationType)}
              buttons={[
                { value: "scheduled", label: "予約", icon: "calendar-check" },
                { value: "walk_in", label: "飛び込み", icon: "walk" },
              ]}
            />
          </Card.Content>
        </Card>

        {/* Customer Picker */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={styles.heading}>
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
                  <Text variant="bodyLarge" style={{ fontWeight: "600" }}>
                    {selectedCustomer.name}
                  </Text>
                  {selectedCustomer.phone && (
                    <Text variant="bodySmall" style={styles.subText}>
                      {selectedCustomer.phone}
                    </Text>
                  )}
                </View>
                <Button
                  mode="text"
                  onPress={() => {
                    setSelectedCustomer(null);
                    setSelectedVehicle(null);
                    setCustomerSearch("");
                  }}
                >
                  変更
                </Button>
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
          </Card.Content>
        </Card>

        {/* Vehicle Picker */}
        {selectedCustomer && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Text variant="titleMedium" style={styles.heading}>
                  車両
                </Text>
                {isWalkIn && (
                  <Chip compact style={styles.optionalChip}>
                    <Text style={styles.optionalText}>任意</Text>
                  </Chip>
                )}
              </View>
              {vehicles.length === 0 ? (
                <Text variant="bodyMedium" style={styles.subText}>
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
                      variant="bodyLarge"
                      style={{
                        fontWeight: selectedVehicle?.id === v.id ? "700" : "400",
                      }}
                    >
                      {v.plate_display ?? "ナンバー未登録"}
                    </Text>
                    <Text variant="bodySmall" style={styles.subText}>
                      {[v.maker, v.model].filter(Boolean).join(" ")}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </Card.Content>
          </Card>
        )}

        {/* Date/Time Picker（予約モードのみ） */}
        {!isWalkIn && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                日時
              </Text>
              <View style={styles.dateRow}>
                <Button
                  mode="outlined"
                  icon="calendar"
                  onPress={() => setShowDatePicker(true)}
                  style={{ flex: 1, marginRight: 8 }}
                >
                  {selectedDate.toLocaleDateString("ja-JP")}
                </Button>
                <Button
                  mode="outlined"
                  icon="clock-outline"
                  onPress={() => setShowTimePicker(true)}
                  style={{ flex: 1 }}
                >
                  {selectedDate.toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Button>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
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
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    setShowTimePicker(false);
                    if (date) setSelectedDate(date);
                  }}
                />
              )}
            </Card.Content>
          </Card>
        )}

        {/* 飛び込みモード情報 */}
        {isWalkIn && (
          <Card style={[styles.card, styles.walkInInfoCard]} mode="outlined">
            <Card.Content style={styles.walkInInfoContent}>
              <Text variant="bodyMedium" style={styles.walkInInfoText}>
                本日の日時で「来店済」ステータスとして登録されます
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Menu Items Multi-select */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              メニュー
            </Text>
            <View style={styles.chipContainer}>
              {menuItems.map((mi) => (
                <Chip
                  key={mi.id}
                  selected={selectedMenuItems.includes(mi.id)}
                  onPress={() => toggleMenuItem(mi.id)}
                  style={styles.chip}
                  showSelectedCheck
                >
                  {mi.name} (¥{mi.unit_price.toLocaleString()})
                </Chip>
              ))}
              {menuItems.length === 0 && (
                <Text variant="bodySmall" style={styles.subText}>
                  メニューが未登録です
                </Text>
              )}
            </View>
            {selectedMenuItems.length > 0 && (
              <Text
                variant="titleSmall"
                style={{
                  marginTop: 12,
                  fontWeight: "700",
                  textAlign: "right",
                }}
              >
                合計: ¥{total.toLocaleString()}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Notes */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
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
          </Card.Content>
        </Card>

        {/* Submit */}
        <View style={styles.submitArea}>
          <Button
            mode="contained"
            icon={isWalkIn ? "walk" : "check"}
            onPress={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={
              createMutation.isPending ||
              selectedMenuItems.length === 0 ||
              (!isWalkIn && (!selectedCustomer || !selectedVehicle))
            }
            style={styles.submitButton}
            buttonColor="#1a1a2e"
          >
            {isWalkIn ? "飛び込み受付を作成" : "予約を作成"}
          </Button>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#ffffff",
  },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  optionalChip: { backgroundColor: "#f4f4f5" },
  optionalText: { fontSize: 11, color: "#71717a" },
  subText: { color: "#71717a", marginTop: 2 },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchbar: {
    backgroundColor: "#f4f4f5",
    elevation: 0,
  },
  vehicleOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    marginTop: 8,
  },
  vehicleSelected: {
    borderColor: "#1a1a2e",
    backgroundColor: "#f0f0ff",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  walkInInfoCard: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },
  walkInInfoContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walkInInfoText: {
    color: "#1d4ed8",
    fontWeight: "600",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    marginBottom: 4,
  },
  submitArea: {
    padding: 16,
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 4,
  },
});
