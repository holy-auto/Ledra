import { useMemo, useState, memo } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text, TextInput } from "react-native-paper";

import {
  menuCategories,
  filterMenuItems,
  type MenuFilterItem,
} from "@/lib/menuFilter";
import { colors, spacing, radius, typography } from "@/constants/tokens";

/**
 * メニュー選択の共通部品。
 * 会計（pos/walk-in）と飛び込み受付（reservations/new）で同じ操作にするため、
 * 検索バー・カテゴリタブ・等幅タイルをここに集約する。
 *
 * ponytail: 一覧の入れ物（FlatList / スクロール内の行）は画面ごとに違うので
 * 共有しない。共有するのは絞り込みとタイルの見た目だけ。
 */

/** 検索語・カテゴリの状態と絞り込み結果。両画面で同じ挙動にする */
export function useMenuFilter<T extends MenuFilterItem>(items: T[]) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("よく使う");

  const categories = useMemo(() => menuCategories(items), [items]);

  // 読込前は selectedCategory が候補に無い。その場合は先頭に落とす
  const activeCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : (categories[0] ?? "すべて");

  const filtered = useMemo(
    () => filterMenuItems(items, activeCategory, search),
    [items, activeCategory, search],
  );

  function changeCategory(cat: string) {
    setSelectedCategory(cat);
    setSearch("");
  }

  return { search, setSearch, categories, activeCategory, changeCategory, filtered };
}

export function MenuFilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  search,
  onSearchChange,
}: {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <>
      <TextInput
        mode="outlined"
        placeholder="メニュー名で検索"
        value={search}
        onChangeText={onSearchChange}
        left={<TextInput.Icon icon="magnify" />}
        right={
          search ? (
            <TextInput.Icon icon="close" onPress={() => onSearchChange("")} />
          ) : undefined
        }
        style={styles.searchInput}
        dense
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScrollContent}
      >
        {categories.map((cat) => (
          <Pressable
            key={cat}
            style={[
              styles.categoryChip,
              activeCategory === cat && styles.categoryChipActive,
            ]}
            onPress={() => onCategoryChange(cat)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeCategory === cat }}
          >
            <Text
              style={[
                styles.categoryChipLabel,
                activeCategory === cat && styles.categoryChipLabelActive,
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

/**
 * POS レジ風の等幅タイル。
 * バッジはタイル内のフローに置く（角丸の外にはみ出させると Android で
 * クリップされて数量が見えなくなる）。
 */
export const MenuTile = memo(function MenuTile({
  name,
  price,
  badge,
  selected,
  onPress,
}: {
  name: string;
  price: number;
  /** 数量。0 なら出さない */
  badge?: number;
  /** 選択済みの見た目にする（数量を持たない多選択用） */
  selected?: boolean;
  onPress: () => void;
}) {
  const active = selected || (badge ?? 0) > 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        active && styles.tileActive,
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${name} ${price}円${active ? "（選択中）" : ""}`}
    >
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
      <View style={styles.tileFooter}>
        <Text style={styles.tilePrice}>¥{price.toLocaleString()}</Text>
        {(badge ?? 0) > 0 && (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>{badge}</Text>
          </View>
        )}
        {selected && (badge ?? 0) === 0 && (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>✓</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

/** 空きスロット。端数行のタイルが横に伸びるのを防ぐ */
export function MenuTileSpacer() {
  return <View style={styles.tileSpacer} />;
}

export const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  categoryScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
  },
  categoryChipLabelActive: {
    color: colors.textOnPrimary,
  },
  tile: {
    flex: 1,
    minHeight: 80,
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tilePressed: { opacity: 0.6 },
  tileSpacer: { flex: 1 },
  tileName: {
    ...typography.label,
    color: colors.textPrimary,
  },
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tilePrice: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  tileBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: {
    ...typography.meta,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
});
