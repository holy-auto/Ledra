import { MD3LightTheme } from "react-native-paper";
import { colors, radius } from "./tokens";

/**
 * React Native Paper theme — aligned with Ledra design tokens.
 *
 * Consumers that need raw token values should import from `@/constants/tokens`
 * directly. This file exists solely for Paper's <PaperProvider theme={theme}>.
 */
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primaryLight,
    secondary: colors.info,
    secondaryContainer: colors.infoLight,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    background: colors.background,
    error: colors.danger,
    errorContainer: colors.dangerLight,
    outline: colors.border,
    onPrimary: colors.textOnPrimary,
    onSecondary: colors.textOnPrimary,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textSecondary,
  },
  roundness: radius.md,
};

export type AppTheme = typeof theme;
