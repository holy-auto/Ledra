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

import type { PassportCertCard, PassportData, PassportMetaAnchor } from "./getPassportData";
import type { PassportVerifyResponse } from "./api/verify";
import type { PublicTransferView } from "./transfers/respond";
import type { PIIFieldOverlap } from "@/lib/vehicles/customerRelation";

// ponytail: PIIFieldOverlap only inspects a type's own top-level keys, not
// nested object/array shapes. Below, every nested object type that appears
// inside a checked type is also checked individually (PassportMetaAnchor,
// and PassportVerifyResponse's inline vehicle/summary/meta_anchor/certificates
// shapes) so PII added inside a nested field isn't invisible to the guard.
// Upgrade path if nesting grows further: a recursive mapped-type PII walker.

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

// PassportData: the top-level passport data object. Its `certificates` items
// are PassportCertCard (already checked above); `meta_anchor` is PassportMetaAnchor
// (checked here since it's a distinct nested shape).
type _PassportDataPII = PIIFieldOverlap<PassportData> | PIIFieldOverlap<PassportMetaAnchor>;
type _AssertPassportDataClean = _PassportDataPII extends never
  ? true
  : { ERROR: "PassportData contains PII"; fields: _PassportDataPII };
const _passportDataCheck: _AssertPassportDataClean = true;

// PassportVerifyResponse: the API response shape. Its nested `vehicle`/`summary`/
// `meta_anchor`/`certificates[]` shapes are inline types unique to this response,
// so each is checked individually alongside the top-level keys.
type _VerifyResponsePII =
  | PIIFieldOverlap<PassportVerifyResponse>
  | PIIFieldOverlap<PassportVerifyResponse["vehicle"]>
  | PIIFieldOverlap<PassportVerifyResponse["summary"]>
  | PIIFieldOverlap<NonNullable<PassportVerifyResponse["meta_anchor"]>>
  | PIIFieldOverlap<PassportVerifyResponse["certificates"][number]>;
type _AssertVerifyResponseClean = _VerifyResponsePII extends never
  ? true
  : { ERROR: "PassportVerifyResponse contains PII"; fields: _VerifyResponsePII };
const _verifyResponseCheck: _AssertVerifyResponseClean = true;

// PublicTransferView: the transfer view shown to recipients.
// This correctly exposes to_owner_* (the recipient's own data) but
// must not expose from_owner_* (previous owner's PII) — uses the shared
// registry (like the other checks) rather than a hand-rolled field list.
type _TransferViewPII = PIIFieldOverlap<PublicTransferView>;
type _AssertTransferViewClean = _TransferViewPII extends never
  ? true
  : { ERROR: "PublicTransferView exposes prior-owner PII"; fields: _TransferViewPII };
const _transferViewCheck: _AssertTransferViewClean = true;

// Export the check values to prevent tree-shaking from removing them.
// The runtime value is always `true`; the types do the actual guarding.
export const PII_ASSERTIONS_VALID = _certCardCheck && _passportDataCheck && _verifyResponseCheck && _transferViewCheck;
