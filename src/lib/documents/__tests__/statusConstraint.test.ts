import { describe, it, expect } from "vitest";
import { DOC_TYPE_LIST, STATUS_OPTIONS, nextStatusesFor, type DocumentStatus } from "@/types/document";

/**
 * documents.status の CHECK 制約が許可する値（DB がソースオブトゥルース）。
 * supabase/migrations/20260805085225_documents_status_overdue.sql と一致させること。
 * アプリが遷移させ得るステータスがこの集合を外れると PUT が CHECK 違反 (23514) で
 * 500 になり、ステータス変更が黙って適用されなくなる。過去に 'overdue' が制約から
 * 漏れて同事象が起きたため、その再発をこのテストで検知する。
 */
const DB_ALLOWED_STATUSES = new Set<DocumentStatus>([
  "draft",
  "sent",
  "accepted",
  "paid",
  "overdue",
  "rejected",
  "cancelled",
]);

describe("documents status ⊆ DB CHECK constraint", () => {
  it("STATUS_OPTIONS はすべて DB 許可値（'all' を除く）", () => {
    for (const opt of STATUS_OPTIONS) {
      if (opt.value === "all") continue;
      expect(DB_ALLOWED_STATUSES.has(opt.value as DocumentStatus)).toBe(true);
    }
  });

  it("全 doc_type × 全ステータスの遷移先が DB 許可値に収まる", () => {
    const statuses = STATUS_OPTIONS.map((o) => o.value).filter((v) => v !== "all") as DocumentStatus[];
    for (const dt of DOC_TYPE_LIST) {
      for (const from of statuses) {
        for (const to of nextStatusesFor(dt.value, from)) {
          expect(DB_ALLOWED_STATUSES.has(to as DocumentStatus), `${dt.value}: ${from} → ${to} は DB 制約外`).toBe(true);
        }
      }
    }
  });
});
