import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";

interface MenuItem {
  icon: string;
  label: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: "account-group", label: "顧客管理", route: "/customers" },
  { icon: "car", label: "車両管理", route: "/vehicles" },
  { icon: "certificate", label: "証明書", route: "/certificates" },
  { icon: "nfc", label: "NFC", route: "/nfc/scan" },
  { icon: "tag-multiple", label: "NFCタグ台帳", route: "/nfc/tags" },
  { icon: "cash-register", label: "レジ管理", route: "/pos/register" },
  { icon: "cog-outline", label: "設定", route: "/settings" },
];

export default function MoreScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.route}
            style={styles.gridItem}
            onPress={() => router.push(item.route as never)}
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
    width: "30%",
    aspectRatio: 1,
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
