import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import { colors } from "@/constants/tokens";

export interface Step {
  label: string;
}

interface Props {
  steps: Step[];
  current: number;
}

const CIRCLE = 28;

/**
 * Steps — stepper / progress indicator using Ledra design tokens.
 */
export function Steps({ steps, current }: Props) {
  return (
    <View style={styles.container} accessibilityRole="list">
      {steps.map((step, i) => {
        const isCompleted = i < current;
        const isCurrent = i === current;
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;
        const leftFilled = i <= current;
        const rightFilled = i < current;
        const state = isCompleted ? "完了" : isCurrent ? "現在" : "未完了";

        return (
          <View key={i} style={styles.step}>
            <View style={styles.connectorRow}>
              <View
                style={[
                  styles.connector,
                  { backgroundColor: leftFilled ? colors.primary : colors.border },
                  isFirst && styles.connectorHidden,
                ]}
              />
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isCurrent && styles.circleCurrent,
                  !isCompleted && !isCurrent && styles.circleUpcoming,
                ]}
                accessible
                accessibilityRole="text"
                {...(isCurrent ? { "aria-current": "step" } : {})}
                accessibilityLabel={`ステップ${i + 1} ${step.label} ${state}`}
              >
                {isCompleted ? (
                  <Icon source="check" size={16} color={colors.textOnPrimary} />
                ) : (
                  <Text
                    style={[
                      styles.number,
                      isCurrent ? styles.numberCurrent : styles.numberUpcoming,
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.connector,
                  { backgroundColor: rightFilled ? colors.primary : colors.border },
                  isLast && styles.connectorHidden,
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                isCompleted || isCurrent ? styles.labelActive : styles.labelUpcoming,
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  step: { flex: 1, alignItems: "center" },
  connectorRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  connector: { flex: 1, height: 2 },
  connectorHidden: { backgroundColor: "transparent" },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  circleCompleted: { backgroundColor: colors.primary },
  circleCurrent: {
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.primaryLight,
  },
  circleUpcoming: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  number: { fontSize: 13, fontWeight: "700" },
  numberCurrent: { color: colors.textOnPrimary },
  numberUpcoming: { color: colors.textSecondary },
  label: { marginTop: 6, fontSize: 12, textAlign: "center" },
  labelActive: { color: colors.textPrimary, fontWeight: "600" },
  labelUpcoming: { color: colors.textSecondary },
});
