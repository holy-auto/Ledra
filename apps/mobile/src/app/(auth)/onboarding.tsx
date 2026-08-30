import { useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";

import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

interface Slide {
  icon: string;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: "shield-check",
    title: "ようこそ、Ledraへ",
    description:
      "施工の証明を、正確に・安全に・いつでも確認できるプラットフォームです。",
  },
  {
    icon: "camera",
    title: "作業を記録する",
    description:
      "写真・動画・作業内容を記録して、信頼できる証明を残します。",
  },
  {
    icon: "qrcode-scan",
    title: "証明を共有・確認する",
    description:
      "お客様や保険会社、買取業者などがQRコードで簡単に確認できます。",
  },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      setCompleted(true);
    }
  }, [activeIndex]);

  function handleSkip() {
    setCompleted(true);
  }

  function handleStart() {
    router.replace("/(tabs)");
  }

  // ── Completion screen ──
  if (completed) {
    return (
      <View style={styles.completionScreen}>
        <View style={styles.completionIconWrap}>
          <Icon source="check-circle" size={72} color={colors.success} />
        </View>
        <Text style={styles.completionTitle}>準備が完了しました！</Text>
        <Text style={styles.completionDescription}>
          それでは、Ledraを使って安心で信頼される仕事をはじめましょう。
        </Text>
        <View style={styles.completionButtonWrap}>
          <LedraButton onPress={handleStart}>Ledraをはじめる</LedraButton>
        </View>
      </View>
    );
  }

  // ── Slides ──
  return (
    <View style={styles.screen}>
      {/* Skip button */}
      <View style={styles.skipRow}>
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>スキップ</Text>
        </Pressable>
      </View>

      {/* Slide carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.slideIconWrap}>
              <Icon source={item.icon} size={64} color={colors.primary} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideDescription}>{item.description}</Text>
          </View>
        )}
      />

      {/* Bottom: dots + next */}
      <View style={styles.bottomArea}>
        {/* Page indicator dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Next link */}
        <Pressable onPress={handleNext} style={styles.nextLink}>
          <Text style={styles.nextLinkText}>
            {activeIndex < SLIDES.length - 1 ? "次へ >" : "完了 >"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Skip
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
  },
  skipButton: {
    minHeight: sizing.touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  skipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },

  // Slide
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["3xl"],
  },
  slideIconWrap: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["3xl"],
  },
  slideTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  slideDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },

  // Bottom area
  bottomArea: {
    alignItems: "center",
    paddingBottom: spacing["4xl"],
    gap: spacing.xl,
  },
  dotsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
  nextLink: {
    minHeight: sizing.touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  nextLinkText: {
    ...typography.label,
    color: colors.primary,
  },

  // Completion
  completionScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },
  completionIconWrap: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["2xl"],
  },
  completionTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  completionDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  completionButtonWrap: {
    alignSelf: "stretch",
    marginTop: spacing["3xl"],
  },
});
