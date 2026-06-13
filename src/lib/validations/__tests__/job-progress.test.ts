import { describe, expect, it } from "vitest";
import {
  JOB_STATUSES,
  isJobStatus,
  nextJobStatus,
  jobStatusUpdateSchema,
  type JobStatus,
} from "@/lib/validations/job-progress";

describe("job-progress status helpers", () => {
  it("isJobStatus narrows valid stage strings", () => {
    expect(isJobStatus("draft")).toBe(true);
    expect(isJobStatus("ready")).toBe(true);
    expect(isJobStatus("delivered")).toBe(true);
    expect(isJobStatus("paid")).toBe(false); // 請求書 status とは別軸
    expect(isJobStatus("")).toBe(false);
    expect(isJobStatus(null)).toBe(false);
  });

  it("nextJobStatus advances exactly one stage", () => {
    expect(nextJobStatus("draft")).toBe("booked");
    expect(nextJobStatus("booked")).toBe("in_progress");
    expect(nextJobStatus("in_progress")).toBe("qc");
    expect(nextJobStatus("qc")).toBe("ready");
    expect(nextJobStatus("ready")).toBe("delivered");
  });

  it("nextJobStatus is idempotent at the final stage", () => {
    expect(nextJobStatus("delivered")).toBe("delivered");
  });

  it("walks the full pipeline via repeated nextJobStatus", () => {
    let s: JobStatus = "draft";
    const path: JobStatus[] = [s];
    for (let i = 0; i < 10; i++) {
      const n = nextJobStatus(s);
      if (n === s) break;
      s = n;
      path.push(s);
    }
    expect(path).toEqual([...JOB_STATUSES]);
  });
});

describe("jobStatusUpdateSchema", () => {
  it("accepts a valid status", () => {
    const r = jobStatusUpdateSchema.safeParse({ status: "ready" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = jobStatusUpdateSchema.safeParse({ status: "shipped" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing status", () => {
    const r = jobStatusUpdateSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
