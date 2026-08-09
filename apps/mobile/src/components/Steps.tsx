import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";

import { theme } from "@/constants/theme";

export interface Step {
  label: string;
}

interface Props {
  /** 表示するステップ一覧（左→右の順）。 */
  steps: Step[];
  /** 現在のステップ（0始まり）。手前は完了、先は未完了として描画される。 */
  current: number;
}

const CIRCLE = 28;

/**
 * Steps（ステッパー / 進捗インジケーター）。
 * 完了ステップは番号をチェックに置き換え、現在ステップを強調、先のステップは淡色にする。
 * 各ステップは番号付きの円（indicator）と、隣接ステップをつなぐ線（connector）で構成される。
 */
export function Steps({ steps, current }: Props) {
  return (
    <View style={styles.container} accessibilityRole="list">
      {/* container に accessible を付けると子が1ノードに潰れ、各ステップの
          ラベル/aria-current が読み上げられない。各円側で accessible にする。 */}
      {steps.map((step, i) => {
        const isCompleted = i < current;
        const isCurrent = i === current;
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;

        // 手前(通過済み)の線は tint、先の線は muted。
        const leftFilled = i <= current;
        const rightFilled = i < current;

        const state = isCompleted ? "完了" : isCurrent ? "現在" : "未完了";

        return (
          <View key={i} style={styles.step}>
            {/* connector（円の中心を通る線） */}
            <View style={styles.connectorRow}>
              <View
                style={[
                  styles.connector,
                  { backgroundColor: leftFilled ? theme.colors.primary : theme.colors.outline },
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
                // Web(react-native-web)では aria-current が現在ステップとして解釈される。
                {...(isCurrent ? { "aria-current": "step" } : {})}
                accessibilityLabel={`ステップ${i + 1} ${step.label} ${state}`}
              >
                {isCompleted ? (
                  <Icon source="check" size={16} color={theme.colors.onPrimary} />
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
                  { backgroundColor: rightFilled ? theme.colors.primary : theme.colors.outline },
                  isLast && styles.connectorHidden,
                ]}
              />
            </View>

            {/* step label */}
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
  step: {
    flex: 1,
    alignItems: "center",
  },
  connectorRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  connector: {
    flex: 1,
    height: 2,
  },
  connectorHidden: {
    backgroundColor: "transparent",
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  circleCompleted: {
    backgroundColor: theme.colors.primary,
  },
  circleCurrent: {
    backgroundColor: theme.colors.primary,
    borderWidth: 3,
    borderColor: theme.colors.primaryContainer,
  },
  circleUpcoming: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
  },
  number: {
    fontSize: 13,
    fontWeight: "700",
  },
  numberCurrent: {
    color: theme.colors.onPrimary,
  },
  numberUpcoming: {
    color: theme.colors.onSurfaceVariant,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    textAlign: "center",
  },
  labelActive: {
    color: theme.colors.onSurface,
    fontWeight: "600",
  },
  labelUpcoming: {
    color: theme.colors.onSurfaceVariant,
  },
});
