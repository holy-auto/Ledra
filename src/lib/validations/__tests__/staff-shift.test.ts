import { describe, expect, it } from "vitest";
import { staffShiftCreateSchema, staffShiftUpdateSchema, staffShiftBulkSchema } from "@/lib/validations/staff-shift";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("staffShiftCreateSchema", () => {
  it("accepts a valid shift with defaults", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "09:00",
      end_time: "18:00",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.break_minutes).toBe(60); // default
      expect(r.data.notes).toBeNull();
      expect(r.data.staff_name).toBeNull();
    }
  });

  it("rejects end_time <= start_time", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "18:00",
      end_time: "09:00",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("end_time"))).toBe(true);
    }
  });

  it("rejects equal start and end", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "09:00",
      end_time: "09:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed time", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "9:00",
      end_time: "18:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects out-of-range hour", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "25:00",
      end_time: "26:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed date", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026/06/15",
      start_time: "09:00",
      end_time: "18:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-uuid user_id", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: "not-a-uuid",
      shift_date: "2026-06-15",
      start_time: "09:00",
      end_time: "18:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative break_minutes", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "09:00",
      end_time: "18:00",
      break_minutes: -10,
    });
    expect(r.success).toBe(false);
  });

  it("truncates/normalizes empty notes to null", () => {
    const r = staffShiftCreateSchema.safeParse({
      user_id: VALID_UUID,
      shift_date: "2026-06-15",
      start_time: "09:00",
      end_time: "18:00",
      notes: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notes).toBeNull();
  });
});

describe("staffShiftUpdateSchema", () => {
  it("accepts id only (no field changes)", () => {
    const r = staffShiftUpdateSchema.safeParse({ id: VALID_UUID });
    expect(r.success).toBe(true);
  });

  it("allows updating only start_time without end_time", () => {
    const r = staffShiftUpdateSchema.safeParse({ id: VALID_UUID, start_time: "10:00" });
    expect(r.success).toBe(true);
  });

  it("validates end > start only when both present", () => {
    const ok = staffShiftUpdateSchema.safeParse({ id: VALID_UUID, start_time: "09:00", end_time: "18:00" });
    expect(ok.success).toBe(true);
    const bad = staffShiftUpdateSchema.safeParse({ id: VALID_UUID, start_time: "18:00", end_time: "09:00" });
    expect(bad.success).toBe(false);
  });
});

describe("staffShiftBulkSchema", () => {
  const one = {
    user_id: VALID_UUID,
    shift_date: "2026-06-15",
    start_time: "09:00",
    end_time: "18:00",
  };

  it("accepts up to 50 shifts", () => {
    const r = staffShiftBulkSchema.safeParse({ shifts: Array.from({ length: 50 }, () => one) });
    expect(r.success).toBe(true);
  });

  it("rejects more than 50 shifts", () => {
    const r = staffShiftBulkSchema.safeParse({ shifts: Array.from({ length: 51 }, () => one) });
    expect(r.success).toBe(false);
  });

  it("rejects empty array", () => {
    const r = staffShiftBulkSchema.safeParse({ shifts: [] });
    expect(r.success).toBe(false);
  });

  it("rejects when any shift is invalid", () => {
    const r = staffShiftBulkSchema.safeParse({
      shifts: [one, { ...one, end_time: "08:00" }],
    });
    expect(r.success).toBe(false);
  });
});
