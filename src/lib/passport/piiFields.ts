/**
 * PII field registry for passport public surfaces.
 *
 * This module exists to make the PII exclusion from public passport
 * responses **explicit and auditable**. The types in getPassportData.ts
 * and api/verify.ts are already PII-free, but that safety is implicit
 * (you'd have to read each SELECT and each type to verify it). This
 * module provides compile-time assertions that catch regressions.
 *
 * ponytail: zero runtime cost — all checks are compile-time types.
 */

import type { PassportCertCard, PassportData } from "./getPassportData";
import type { PassportVerifyResponse } from "./api/verify";
import type { PublicTransferView } from "./transfers/respond";
import type { PIIFieldOverlap } from "@/lib/vehicles/customerRelation";

// ---------------------------------------------------------------------------
// Compile-time PII assertions
// ---------------------------------------------------------------------------

// PassportCertCard: the shape of each certificate in the public timeline.
// Must have zero overlap with PII fields.
type _CertCardPII = PIIFieldOverlap<PassportCertCard>;
type _AssertCertCardClean = _CertCardPII extends never
  ? true
  : { ERROR: "PassportCertCard contains PII"; fields: _CertCardPII };
const _certCardCheck: _AssertCertCardClean = true;

// PassportData: the top-level passport data object.
type _PassportDataPII = PIIFieldOverlap<PassportData>;
type _AssertPassportDataClean = _PassportDataPII extends never
  ? true
  : { ERROR: "PassportData contains PII"; fields: _PassportDataPII };
const _passportDataCheck: _AssertPassportDataClean = true;

// PassportVerifyResponse: the API response shape.
type _VerifyResponsePII = PIIFieldOverlap<PassportVerifyResponse>;
type _AssertVerifyResponseClean = _VerifyResponsePII extends never
  ? true
  : { ERROR: "PassportVerifyResponse contains PII"; fields: _VerifyResponsePII };
const _verifyResponseCheck: _AssertVerifyResponseClean = true;

// PublicTransferView: the transfer view shown to recipients.
// This correctly exposes to_owner_* (the recipient's own data) but
// must not expose from_owner_* (previous owner's PII).
type _TransferViewPII = Extract<
  keyof PublicTransferView,
  "from_owner_email" | "from_owner_name" | "customer_name" | "customer_email"
>;
type _AssertTransferViewClean = _TransferViewPII extends never
  ? true
  : { ERROR: "PublicTransferView exposes prior-owner PII"; fields: _TransferViewPII };
const _transferViewCheck: _AssertTransferViewClean = true;

// Export the check values to prevent tree-shaking from removing them.
// The runtime value is always `true`; the types do the actual guarding.
export const PII_ASSERTIONS_VALID = _certCardCheck && _passportDataCheck && _verifyResponseCheck && _transferViewCheck;
