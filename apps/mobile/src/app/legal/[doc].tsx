import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, typography } from "@/constants/tokens";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.ledra.co.jp";

/** Web の src/lib/legal/documents.ts と同じ構造。文面はサーバー側が単一定義源 */
type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "contact"; before: string; email: string; after?: string };

interface LegalDocument {
  title: string;
  updated: string;
  blocks: LegalBlock[];
}

/**
 * 利用規約・プライバシーポリシーをアプリ内で表示する。
 *
 * ponytail: 文面をアプリ側に複製せず /api/legal/[doc] から取得する。
 * 法務文書を 2 箇所に持つと片方だけ古くなり、それがそのまま実害になる。
 */
export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const { data, isLoading, isError } = useQuery<LegalDocument>({
    queryKey: ["legal", doc],
    queryFn: async () => {
      const res = await fetch(`${WEB_BASE}/api/legal/${doc}`);
      if (!res.ok) throw new Error("読み込みに失敗しました");
      return res.json();
    },
    enabled: !!doc,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <>
      <Stack.Screen options={{ title: data?.title ?? "" }} />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : isError || !data ? (
        <EmptyState
          icon="file-document-outline"
          title="読み込めませんでした"
          description="通信環境を確認して、もう一度お試しください"
        />
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.updated}>最終更新日：{data.updated}</Text>
          {data.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
          <View style={{ height: spacing["4xl"] }} />
        </ScrollView>
      )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "h2") {
    return <Text style={styles.h2}>{block.text}</Text>;
  }
  if (block.type === "ul") {
    return (
      <View style={styles.list}>
        {block.items.map((item) => (
          <View key={item} style={styles.listItem}>
            <Text style={styles.bullet}>・</Text>
            <Text style={styles.body}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (block.type === "contact") {
    return (
      <Text style={styles.body}>
        {block.before}
        <Text
          style={styles.link}
          onPress={() => void Linking.openURL(`mailto:${block.email}`)}
        >
          {block.email}
        </Text>
        {block.after}
      </Text>
    );
  }
  return <Text style={styles.body}>{block.text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  updated: { ...typography.meta, color: colors.textSecondary, marginBottom: spacing.xl },
  h2: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  list: { marginBottom: spacing.md, gap: spacing.xs },
  listItem: { flexDirection: "row", gap: spacing.xs },
  bullet: { ...typography.bodySmall, color: colors.textSecondary },
  link: { color: colors.primary, textDecorationLine: "underline" },
});
