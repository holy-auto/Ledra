/**
 * IMP-050: プライバシー・データ保護基盤（v2.0 §18）。
 *
 * 4 段階データ分類 + 4 段階可視性モデル + レンディションマスキング +
 * エクスポート監査を提供する。
 */

// ── Classification ──
export {
  DATA_CLASSIFICATIONS,
  type DataClassification,
  isStricterThan,
  stricterOf,
  FIELD_CLASSIFICATIONS,
  type FieldClassificationEntry,
  getFieldClassification,
  maxClassification,
  findClassificationViolations,
} from "./classification";

// ── Visibility ──
export {
  VISIBILITY_LEVELS,
  type VisibilityLevel,
  isMoreRestrictive,
  canAccess,
  type ViewerRole,
  type ViewerContext,
  resolveVisibility,
  DEFAULT_REQUIRED_VISIBILITY,
  type FieldVisibilityRule,
  findHiddenFields,
} from "./visibility";

// ── Rendition ──
export {
  MASKING_STRATEGIES,
  type MaskingStrategy,
  type MaskingRule,
  type Redacted,
  applyMask,
  createRendition,
  CERTIFICATE_PUBLIC_RULES,
  VEHICLE_PUBLIC_RULES,
  PASSPORT_PUBLIC_RULES,
} from "./rendition";

// ── Export Audit ──
export {
  EXPORT_SCOPES,
  type ExportScope,
  EXPORT_PERMISSION_VERB,
  type DataExportEvent,
  createExportAuditEntry,
  detectAbnormalExportFrequency,
} from "./exportAudit";
