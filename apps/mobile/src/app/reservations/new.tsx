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
} from "react-native-paper";
import { router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Vehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string | null;
}

export default function ReservationNewScreen() {
  const { user, selectedStore } = useAuthStore();

  // Form state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedMenuItems, setSelectedMenuItems] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // Customer search
  const { data: customers = [], isFetching: searchingCustomers } = useQuery<
    Customer[]
  >({
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
        .select("id, plate_number, make, model")
        .eq("customer_id", selectedCustomer!.id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCustomer,
  });

  // Menu items
  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu-items", selectedStore?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, category")
        .eq("tenant_id", user!.tenantId)
        .eq("store_id", selectedStore!.id)
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedStore,
  });

  // Submit
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !selectedVehicle) {
        throw new Error("顧客と車両を選択してください");
      }
      if (selectedMenuItems.length === 0) {
        throw new Error("メニューを1つ以上選択してください");
      }

      const scheduledDate = selectedDate.toISOString().split("T")[0];
      const scheduledTime = selectedDate.toTimeString().slice(0, 5);

      const items = selectedMenuItems.map((menuItemId) => {
        const mi = menuItems.find((m) => m.id === menuItemId);
        return {
          menu_item_id: menuItemId,
          quantity: 1,
          unit_price: mi?.price ?? 0,
        };
      });

      const { data, error } = await supabase
        .from("reservations")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          customer_id: selectedCustomer.id,
          vehicle_id: selectedVehicle.id,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          status: "confirmed",
          payment_status: "unpaid",
          notes: notes || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("reservation_items")
          .insert(
            items.map((item) => ({
              reservation_id: data.id,
              ...item,
            }))
          );
        if (itemsError) throw itemsError;
      }

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
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const total = selectedMenuItems.reduce((sum, id) => {
    const mi = menuItems.find((m) => m.id === id);
    return sum + (mi?.price ?? 0);
  }, 0);

  return (
    <>
      <Stack.Screen options={{ title: "予約作成" }} />
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* Customer Picker */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              顧客
            </Text>
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
              <Text variant="titleMedium" style={styles.heading}>
                車両
              </Text>
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
                        fontWeight:
                          selectedVehicle?.id === v.id ? "700" : "400",
                      }}
                    >
                      {v.plate_number}
                    </Text>
                    <Text variant="bodySmall" style={styles.subText}>
                      {[v.make, v.model].filter(Boolean).join(" ")}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </Card.Content>
          </Card>
        )}

        {/* Date/Time Picker */}
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
                  {mi.name} ({"\u00a5"}
                  {mi.price.toLocaleString()})
                </Chip>
              ))}
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
                合計: {"\u00a5"}
                {total.toLocaleString()}
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
            icon="check"
            onPress={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={
              createMutation.isPending ||
              !selectedCustomer ||
              !selectedVehicle ||
              selectedMenuItems.length === 0
            }
            style={styles.submitButton}
            buttonColor="#1a1a2e"
          >
            予約を作成
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
