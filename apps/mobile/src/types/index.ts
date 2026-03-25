/**
 * Shared type definitions
 * Copied from Web app (src/types/)
 * Keep in sync when web types change.
 */
export type { CertificateStatus, CertificateRow, NfcStatus } from "./certificate";
export type { PaymentMethod, PaymentStatus, PaymentRow } from "./payment";
export type { Register, RegisterSessionStatus, RegisterSession } from "./register";
export type { DocType, DocumentStatus, DocumentItem, DocumentRow } from "./document";
export {
  PAYMENT_METHODS,
  VALID_PAYMENT_METHODS,
  RESERVATION_STATUS_MAP,
  RESERVATION_PAYMENT_STATUS_MAP,
} from "./pos-constants";
export type { PaymentMethodValue } from "./pos-constants";
export {
  CERTIFICATE_STATUS_MAP,
  NFC_STATUS_MAP,
  PAYMENT_STATUS_MAP,
  getStatusEntry,
} from "./statusMaps";
export type { BadgeVariant } from "./statusMaps";
