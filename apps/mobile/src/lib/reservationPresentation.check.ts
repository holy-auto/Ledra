import assert from "node:assert/strict";

import { getReservationPresentation } from "./reservationPresentation.ts";

const simple = getReservationPresentation("simple");
const standard = getReservationPresentation("standard");
const dense = getReservationPresentation("dense");

assert.equal(simple.cardVariant, "simple");
assert.equal(standard.cardVariant, "standard");
assert.equal(dense.cardVariant, "dense");
assert.ok(simple.initialNumToRender < dense.initialNumToRender);
assert.ok(standard.windowSize < dense.windowSize);
assert.equal(simple.queryLimit, 200);
assert.equal(standard.queryLimit, 200);
assert.equal(dense.queryLimit, 200);

console.log("reservationPresentation.check.ts OK");
