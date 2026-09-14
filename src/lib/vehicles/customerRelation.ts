/**
 * Vehicle-customer relationship type model (ADR-0006).
 *
 * v2.0 requires vehicle identity to be independent of customer PII.
 * The customer-vehicle link is modelled as a **relationship** rather
 * than a direct FK (`vehicles.customer_id`), so that:
 *
 * - Relationship start/end (ownership transfer, sale) can be tracked
 * - Prior-owner PII is not exposed to new owners
 * - Vehicle history survives customer deletion/anonymization
 * - Public certificate/passport pages render without any customer PII
 *
 * Currently `vehicles.customer_id` is a direct FK. This module defines
 * the target type model for the relationship entity. The DB migration
 * (adding a `vehicle_customer_relationships` table and deprecating the
 * direct FK) is deferred until consuming code requires the history
 * tracking — IMP-050 (privacy enhancement) is the likely trigger.
 *
 * Cross-tenant ownership is already handled by `vehicle_passports` +
 * `passport_ownership_transfers` (separate from per-tenant customer links).
 *
 * ponytail: types only — no DB migration, no UI change. The current
 * customer_id FK works; this prepares the contract for when it doesn't.
 */

// ---------------------------------------------------------------------------
// Relationship types
// ---------------------------------------------------------------------------

/** How a customer is related to a vehicle within a single tenant. */
export type VehicleCustomerRelationType = "owner" | "lessee" | "user";

/**
 * A single relationship between a vehicle and a customer.
 * Replaces the scalar `vehicles.customer_id` with a first-class entity
 * that tracks when the relationship started and ended.
 */
export type VehicleCustomerRelation = {
  vehicleId: string;
  customerId: string;
  tenantId: string;
  relationType: VehicleCustomerRelationType;
  startedAt: string; // ISO 8601
  endedAt: string | null; // null = current
  endReason: VehicleRelationEndReason | null;
};

/** Why a vehicle-customer relationship ended. */
export type VehicleRelationEndReason =
  | "sold" // customer sold the vehicle
  | "transferred" // ownership transferred via passport flow
  | "returned" // lease return
  | "unlinked" // manually unlinked by shop staff
  | "customer_deleted"; // customer requested deletion (IMP-050)

// ---------------------------------------------------------------------------
// PII boundary contract
// ---------------------------------------------------------------------------

/**
 * Vehicle identity fields that are safe to expose publicly.
 * Any field NOT in this list is considered PII or internal.
 */
export type PublicVehicleIdentity = {
  vinNormalized: string;
  maker: string | null;
  model: string | null;
  year: number | null;
};

/**
 * Fields that constitute customer PII in the vehicles table.
 * These must NEVER appear in public passport or API responses.
 * (`customer_name`/`customer_email`/`customer_phone_masked` were dropped from
 * this table in migration 20260321000002 — customer contact data now lives
 * only in the `customers` table.)
 */
export const VEHICLE_TABLE_PII_COLUMNS = ["customer_id", "notes", "plate_display"] as const;

/**
 * Fields that constitute customer PII in the vehicle_passports /
 * passport_ownership_transfers tables. Exposed only to authenticated admin
 * views, never to public surfaces.
 */
export const PASSPORT_TABLE_PII_COLUMNS = [
  "current_owner_email",
  "current_owner_name",
  "from_owner_email",
  "from_owner_name",
] as const;

/**
 * Compile-time assertion: ensures a type's keys don't include PII fields.
 * Usage: `type _Check = AssertNoPII<PassportCertCard>;`
 * Produces `never` (good) if no overlap, or the overlapping keys (bad).
 */
export type PIIFieldOverlap<T> = Extract<
  keyof T,
  (typeof VEHICLE_TABLE_PII_COLUMNS)[number] | (typeof PASSPORT_TABLE_PII_COLUMNS)[number]
>;
