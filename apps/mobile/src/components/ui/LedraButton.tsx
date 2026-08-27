import { StyleSheet, type ViewStyle } from "react-native";
import { Button, type ButtonProps } from "react-native-paper";
import { colors, sizing, radius } from "@/constants/tokens";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

interface Props extends Omit<ButtonProps, "mode" | "buttonColor" | "textColor"> {
  variant?: Variant;
  size?: "default" | "small";
  /** Full-width button. Default true for primary variant. */
  fullWidth?: boolean;
}

const variantMap: Record<
  Variant,
  { mode: ButtonProps["mode"]; buttonColor: string; textColor: string }
> = {
  primary: { mode: "contained", buttonColor: colors.primary, textColor: colors.textOnPrimary },
  secondary: { mode: "contained-tonal", buttonColor: colors.primaryLight, textColor: colors.primary },
  outline: { mode: "outlined", buttonColor: "transparent", textColor: colors.primary },
  ghost: { mode: "text", buttonColor: "transparent", textColor: colors.primary },
  danger: { mode: "contained", buttonColor: colors.danger, textColor: colors.textOnDanger },
};

/**
 * Ledra primary button — canonical CTA component.
 *
 * Default height 52px (touch-safe), "small" variant 44px.
 * 44x44 minimum touch target guaranteed in both sizes.
 */
export function LedraButton({
  variant = "primary",
  size = "default",
  fullWidth,
  style,
  contentStyle,
  labelStyle,
  ...rest
}: Props) {
  const v = variantMap[variant];
  const isFullWidth = fullWidth ?? variant === "primary";
  const h = size === "small" ? sizing.ctaHeightSmall : sizing.ctaHeight;

  return (
    <Button
      mode={v.mode}
      buttonColor={v.buttonColor}
      textColor={v.textColor}
      contentStyle={[{ height: h, minWidth: sizing.touchTarget }, contentStyle]}
      labelStyle={[{ fontSize: 16, fontWeight: "600", letterSpacing: 0 }, labelStyle]}
      style={[
        { borderRadius: radius.md },
        variant === "outline" && { borderColor: colors.border },
        isFullWidth && styles.fullWidth,
        style as ViewStyle,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: "stretch" },
});
