/**
 * IMP-051: アクセシビリティ監査フレームワーク（v2.0 §3.5）。
 *
 * WCAG AA 基準型・コントラストチェッカー・コンポーネント ARIA 要件を
 * 単一エントリポイントから再エクスポートする。
 */

export { parseHexColor, relativeLuminance, contrastRatio, meetsWcagAA, checkColorPair } from "./contrastCheck";

export {
  WCAG_AA_KEY_CRITERIA,
  COMPONENT_ARIA_MAP,
  type WcagLevel,
  type WcagCategory,
  type WcagCriterion,
  type A11ySeverity,
  type A11yFinding,
  type A11yAuditResult,
  type ComponentAriaRequirement,
} from "./auditTypes";
