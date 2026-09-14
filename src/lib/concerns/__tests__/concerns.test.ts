import { describe, it, expect } from "vitest";
import {
  CONCERN_SOURCES,
  CONCERN_CATEGORIES,
  CONCERN_STATUSES,
  CONCERN_CATEGORY_LABELS,
  CONCERN_STATUS_LABELS,
  UNRESOLVED_CONCERN_STATUSES,
  type ConcernSource,
  type CustomerConcern,
  type CreateConcernInput,
} from "../types";

describe("Customer Concern types (IMP-026)", () => {
  describe("ConcernSource", () => {
    it("4 つの確認フローに対応", () => {
      expect(CONCERN_SOURCES).toHaveLength(4);
      expect(CONCERN_SOURCES).toContain("delivery_receipt");
      expect(CONCERN_SOURCES).toContain("parts_confirmation");
      expect(CONCERN_SOURCES).toContain("body_repair_consent");
      expect(CONCERN_SOURCES).toContain("body_repair_tracking");
    });

    it("型と配列が一致", () => {
      const check: ConcernSource[] = [...CONCERN_SOURCES];
      expect(check).toEqual(CONCERN_SOURCES);
    });
  });

  describe("ConcernCategory", () => {
    it("5 カテゴリ定義", () => {
      expect(CONCERN_CATEGORIES).toHaveLength(5);
      expect(CONCERN_CATEGORIES).toContain("work_quality");
      expect(CONCERN_CATEGORIES).toContain("wrong_parts");
      expect(CONCERN_CATEGORIES).toContain("pricing");
      expect(CONCERN_CATEGORIES).toContain("damage");
      expect(CONCERN_CATEGORIES).toContain("other");
    });

    it("全カテゴリに日本語ラベルがある", () => {
      for (const cat of CONCERN_CATEGORIES) {
        expect(CONCERN_CATEGORY_LABELS[cat]).toBeTruthy();
        expect(typeof CONCERN_CATEGORY_LABELS[cat]).toBe("string");
      }
    });
  });

  describe("ConcernStatus", () => {
    it("4 ステータス定義", () => {
      expect(CONCERN_STATUSES).toHaveLength(4);
      expect(CONCERN_STATUSES).toContain("open");
      expect(CONCERN_STATUSES).toContain("investigating");
      expect(CONCERN_STATUSES).toContain("resolved");
      expect(CONCERN_STATUSES).toContain("dismissed");
    });

    it("全ステータスに日本語ラベルがある", () => {
      for (const s of CONCERN_STATUSES) {
        expect(CONCERN_STATUS_LABELS[s]).toBeTruthy();
      }
    });

    it("未解決ステータスは open と investigating", () => {
      expect(UNRESOLVED_CONCERN_STATUSES).toEqual(["open", "investigating"]);
    });

    it("resolved/dismissed は未解決に含まれない", () => {
      expect(UNRESOLVED_CONCERN_STATUSES).not.toContain("resolved");
      expect(UNRESOLVED_CONCERN_STATUSES).not.toContain("dismissed");
    });
  });

  describe("CustomerConcern shape", () => {
    it("必須フィールドを含む型が構成可能", () => {
      const concern: CustomerConcern = {
        id: "uuid-1",
        tenant_id: "tenant-1",
        source_type: "delivery_receipt",
        source_token: "token-abc",
        job_id: null,
        certificate_id: "cert-1",
        customer_name: "テスト太郎",
        customer_email: "test@example.com",
        concern_text: "仕上がりに傷があります",
        category: "work_quality",
        status: "open",
        admin_response: null,
        resolved_by: null,
        resolved_at: null,
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-20T00:00:00Z",
      };
      expect(concern.source_type).toBe("delivery_receipt");
      expect(concern.status).toBe("open");
    });

    it("解決済みの懸念が構成可能", () => {
      const concern: CustomerConcern = {
        id: "uuid-2",
        tenant_id: "tenant-1",
        source_type: "parts_confirmation",
        source_token: "token-xyz",
        job_id: "job-1",
        certificate_id: null,
        customer_name: null,
        customer_email: null,
        concern_text: "取り付けた部品が違う",
        category: "wrong_parts",
        status: "resolved",
        admin_response: "正しい部品に交換しました",
        resolved_by: "admin-1",
        resolved_at: "2026-08-21T00:00:00Z",
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-21T00:00:00Z",
      };
      expect(concern.status).toBe("resolved");
      expect(concern.admin_response).toBeTruthy();
      expect(concern.resolved_by).toBeTruthy();
    });
  });

  describe("CreateConcernInput shape", () => {
    it("最小入力で構成可能", () => {
      const input: CreateConcernInput = {
        source_type: "body_repair_tracking",
        source_token: "tok-123",
        concern_text: "塗装の色味が違う",
      };
      expect(input.source_type).toBe("body_repair_tracking");
      expect(input.category).toBeUndefined();
    });

    it("フルの入力で構成可能", () => {
      const input: CreateConcernInput = {
        source_type: "body_repair_consent",
        source_token: "tok-456",
        job_id: "job-1",
        certificate_id: "cert-1",
        customer_name: "山田花子",
        customer_email: "hanako@example.com",
        concern_text: "見積もりと実際の金額が異なる",
        category: "pricing",
      };
      expect(input.category).toBe("pricing");
    });
  });

  describe("DB migration CHECK constraints alignment", () => {
    // ponytail: マイグレーション内の CHECK 制約値とコード側の定数が一致することを確認
    it("source_type の CHECK 値と CONCERN_SOURCES が一致", () => {
      // migration: CHECK (source_type IN ('delivery_receipt', 'parts_confirmation', 'body_repair_consent', 'body_repair_tracking'))
      const migrationValues = ["delivery_receipt", "parts_confirmation", "body_repair_consent", "body_repair_tracking"];
      expect([...CONCERN_SOURCES].sort()).toEqual(migrationValues.sort());
    });

    it("status の CHECK 値と CONCERN_STATUSES が一致", () => {
      // migration: CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed'))
      const migrationValues = ["open", "investigating", "resolved", "dismissed"];
      expect([...CONCERN_STATUSES].sort()).toEqual(migrationValues.sort());
    });

    it("category の CHECK 値と CONCERN_CATEGORIES が一致", () => {
      // migration: CHECK (category IN ('work_quality', 'wrong_parts', 'pricing', 'damage', 'other'))
      const migrationValues = ["work_quality", "wrong_parts", "pricing", "damage", "other"];
      expect([...CONCERN_CATEGORIES].sort()).toEqual(migrationValues.sort());
    });
  });
});
