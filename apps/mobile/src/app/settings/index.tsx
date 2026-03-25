import { View, ScrollView, StyleSheet } from "react-native";
import { Text, Card, Button, Divider, List } from "react-native-paper";
import { router } from "expo-router";
import Constants from "expo-constants";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

export default function SettingsIndexScreen() {
  const { user, selectedStore, setSelectedStore, reset } = useAuthStore();

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "1.0.0";

  async function handleSwitchStore() {
    setSelectedStore(null);
    router.replace("/(auth)/select-store");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    reset();
    router.replace("/(auth)/login");
  }

  return (
    <ScrollView style={styles.container}>
      {/* User Info */}
      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.heading}>
            ユーザー情報
          </Text>
          <Divider style={styles.divider} />

          <InfoRow label="メール" value={user?.email ?? "-"} />
          <InfoRow label="ロール" value={user?.role ?? "-"} />
          <InfoRow label="テナント" value={user?.tenantName ?? "-"} />
          <InfoRow label="店舗" value={selectedStore?.name ?? "-"} />
        </Card.Content>
      </Card>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          mode="outlined"
          icon="store"
          onPress={handleSwitchStore}
          style={styles.actionButton}
          textColor="#1a1a2e"
        >
          店舗切替
        </Button>

        <Button
          mode="outlined"
          icon="logout"
          onPress={handleLogout}
          style={styles.actionButton}
          textColor="#991b1b"
        >
          ログアウト
        </Button>
      </View>

      {/* App Info */}
      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.heading}>
            アプリ情報
          </Text>
          <Divider style={styles.divider} />
          <InfoRow label="アプリ名" value="CARTRUST Mobile" />
          <InfoRow label="バージョン" value={appVersion} />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="labelMedium" style={styles.label}>
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  card: { margin: 12, backgroundColor: "#ffffff" },
  heading: { fontWeight: "700", color: "#1a1a2e" },
  divider: { marginVertical: 12 },
  infoRow: { marginBottom: 8 },
  label: { color: "#71717a", marginBottom: 2 },
  actions: { padding: 12, gap: 8 },
  actionButton: { borderColor: "#e4e4e7" },
});
