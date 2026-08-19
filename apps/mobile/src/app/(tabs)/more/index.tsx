import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";

interface MenuItem {
  icon: string;
  label: string;
  route: string;
}

/**
 * v2.0 §2 / IMP-020: 車両・証明書はトップレベルタブに移動。
 * 代わりに予約と会計をここに配置。
 */
const MENU_ITEMS: MenuItem[] = [
  { icon: "calendar", label: "予約管理", route: "/reservations" },
  { icon: "account-group", label: "顧客管理", route: "/customers" },
  { icon: "cash-register", label: "レジ・会計", route: "/pos/register" },
  { icon: "nfc", label: "NFC", route: "/nfc/scan" },
  { icon: "tag-multiple", label: "NFCタグ台帳", route: "/nfc/tags" },
  { icon: "chart-bar", label: "店舗ダッシュボード", route: "/dashboard" },
  { icon: "cog-outline", label: "設定", route: "/settings" },
];

export default function MoreScreen() {
  const { width } = useWindowDimensions();
  const PADDING = 16;
  const GAP = 12;
  const COLUMNS = 3;
  const itemWidth =
    (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.route}
            style={[styles.gridItem, { width: itemWidth, height: itemWidth }]}
            onPress={() => router.push(item.route as never)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.iconContainer}>
              <Icon source={item.icon} size={28} color="#1a1a2e" />
            </View>
            <Text variant="labelMedium" style={styles.label}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  content: { padding: 16 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f4f4f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  label: {
    color: "#1a1a2e",
    fontWeight: "600",
    textAlign: "center",
  },
});
