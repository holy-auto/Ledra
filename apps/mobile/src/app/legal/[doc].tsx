import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { Text } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import legalDocuments from "@/constants/legalDocuments.json";
import { colors, spacing, typography } from "@/constants/tokens";

/** src/lib/legal/documents.json と同じ構造（同一ファイルのコピー） */
type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "contact"; before: string; email: string; after?: string };

interface LegalDocument {
  slug: string;
  title: string;
  updated: string;
  blocks: LegalBlock[];
}

/**
 * 利用規約・プライバシーポリシーをアプリ内で表示する。
 *
 * ponytail: 文面はアプリに同梱する。サーバーの API から取ると、アプリと Web の
 * リリース時期がずれた瞬間（配信前・古い本番）に表示できなくなる。オフラインの
 * 現場でも読めるべき文書でもある。
 * 正は Web の src/lib/legal/documents.json で、こちらはそのコピー。
 * 2 ファイルがズレていないことは src/lib/legal.check.ts が検証する。
 */
export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const data = (legalDocuments as LegalDocument[]).find((d) => d.slug === doc);

  return (
    <>
      <Stack.Screen options={{ title: data?.title ?? "" }} />
      {!data ? (
        <EmptyState
          icon="file-document-outline"
          title="文書が見つかりません"
          description="アプリを最新版に更新してください"
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
