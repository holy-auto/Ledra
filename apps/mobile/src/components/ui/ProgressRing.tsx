import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Circle } from "react-native-svg";
import { colors, spacing } from "@/constants/tokens";

interface Props {
  /** 0–1 progress value. */
  progress: number;
  /** Size of the ring in px. Default 80. */
  size?: number;
  /** Stroke width. Default 6. */
  strokeWidth?: number;
  /** Center label, e.g. "3/5". If omitted, shows percentage. */
  label?: string;
  /** Secondary text below the label. */
  sublabel?: string;
  /** Override the progress arc color. */
  color?: string;
}

/**
 * ProgressRing — circular progress with center label.
 *
 * v2.0: Today work count + circular progress on Home.
 * Uses react-native-svg (already installed).
 */
export function ProgressRing({
  progress,
  size = 80,
  strokeWidth = 6,
  label,
  sublabel,
  color = colors.primary,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - clamped);
  const center = size / 2;

  const displayLabel = label ?? `${Math.round(clamped * 100)}%`;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamped * 100),
      }}
      accessibilityLabel={sublabel ? `${sublabel}: ${displayLabel}` : displayLabel}
    >
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.surfaceVariant}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{displayLabel}</Text>
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sublabel: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 1,
  },
});
