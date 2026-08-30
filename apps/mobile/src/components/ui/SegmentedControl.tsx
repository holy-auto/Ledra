import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { colors, radius, spacing, sizing } from "@/constants/tokens";

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Hides segments the user cannot access (v2.0: hidden, not disabled). */
  hiddenValues?: T[];
}

/**
 * SegmentedControl — role-aware scope switcher.
 *
 * v2.0 §: Unauthorized scopes are hidden, not disabled.
 * 44px minimum touch target per segment.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  hiddenValues,
}: Props<T>) {
  const visible = hiddenValues
    ? segments.filter((s) => !hiddenValues.includes(s.value))
    : segments;

  if (visible.length <= 1) return null;

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {visible.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(seg.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.label}
          >
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: sizing.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md - 2,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  labelActive: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
});
