import { MD3LightTheme } from "react-native-paper";

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#1a1a2e",
    primaryContainer: "#e6f4fe",
    secondary: "#16213e",
    secondaryContainer: "#e8eaf6",
    surface: "#ffffff",
    surfaceVariant: "#f5f5f5",
    background: "#fafafa",
    error: "#dc2626",
    errorContainer: "#fef2f2",
    outline: "#d4d4d8",
    onPrimary: "#ffffff",
    onSecondary: "#ffffff",
    onSurface: "#18181b",
    onSurfaceVariant: "#71717a",
  },
  roundness: 12,
};

export type AppTheme = typeof theme;
