import { describe, it, expect } from "vitest";
import {
  CANONICAL_TABS,
  WEB_TABS,
  MOBILE_TABS,
  MOBILE_HIDDEN_SCREENS,
  QUICK_CREATE_ACTIONS,
  inferCreateContext,
  applyCreateContext,
  WORK_SCOPES,
  WORK_SCOPE_LABELS,
  availableScopes,
  defaultScope,
} from "../index";

// ── 正準タブ（v2.0 製品不変条件 #2） ──

describe("正準タブ定義", () => {
  it("5 タブ: home / work / vehicles / certificates / more", () => {
    expect(CANONICAL_TABS).toEqual(["home", "work", "vehicles", "certificates", "more"]);
  });

  it("Web タブが正準 5 タブと一致する", () => {
    expect(WEB_TABS.map((t) => t.id)).toEqual([...CANONICAL_TABS]);
  });

  it("Expo モバイルタブが正準 5 タブと一致する", () => {
    expect(MOBILE_TABS.map((t) => t.id)).toEqual([...CANONICAL_TABS]);
  });

  it("旧タブ（reservations / pos）は非表示リストに含まれる", () => {
    expect(MOBILE_HIDDEN_SCREENS).toContain("reservations");
    expect(MOBILE_HIDDEN_SCREENS).toContain("pos");
  });

  it("各 Web タブに href とラベルがある", () => {
    for (const tab of WEB_TABS) {
      expect(tab.href).toBeTruthy();
      expect(tab.label).toBeTruthy();
    }
  });

  it("各モバイルタブに focused / unfocused アイコンがある", () => {
    for (const tab of MOBILE_TABS) {
      expect(tab.icon.focused).toBeTruthy();
      expect(tab.icon.unfocused).toBeTruthy();
    }
  });
});

// ── Quick Create ──

describe("Quick Create アクション", () => {
  it("5 つの作成アクションが定義されている", () => {
    expect(QUICK_CREATE_ACTIONS).toHaveLength(5);
  });

  it("全アクションに id / label / href / permission がある", () => {
    for (const action of QUICK_CREATE_ACTIONS) {
      expect(action.id).toBeTruthy();
      expect(action.label).toBeTruthy();
      expect(action.href).toMatch(/^\/admin\//);
      expect(action.permission).toBeTruthy();
    }
  });

  it("全アクションのセクションが「新規作成」", () => {
    for (const action of QUICK_CREATE_ACTIONS) {
      expect(action.section).toBe("新規作成");
    }
  });

  // 予約・顧客には /new ページが無く、一覧ページの ?create=1 でモーダルを
  // 自動オープンする（ReservationsClient / CustomersClient と同じ規約）。
  it("予約・顧客は /new ではなく ?create=1（該当ページに /new が無いため）", () => {
    const reservation = QUICK_CREATE_ACTIONS.find((a) => a.id === "reservation");
    const customer = QUICK_CREATE_ACTIONS.find((a) => a.id === "customer");
    expect(reservation?.href).toBe("/admin/reservations?create=1");
    expect(customer?.href).toBe("/admin/customers?create=1");
  });

  it("車両・証明書・請求書は /new ページを持つので href もそのまま", () => {
    const vehicle = QUICK_CREATE_ACTIONS.find((a) => a.id === "vehicle");
    const certificate = QUICK_CREATE_ACTIONS.find((a) => a.id === "certificate");
    const invoice = QUICK_CREATE_ACTIONS.find((a) => a.id === "invoice");
    expect(vehicle?.href).toBe("/admin/vehicles/new");
    expect(certificate?.href).toBe("/admin/certificates/new");
    expect(invoice?.href).toBe("/admin/invoices/new");
  });
});

describe("inferCreateContext()", () => {
  it("顧客詳細ページ → customerId を抽出", () => {
    expect(inferCreateContext("/admin/customers/abc-123")).toEqual({ customerId: "abc-123" });
  });

  it("車両詳細ページ → vehicleId を抽出", () => {
    expect(inferCreateContext("/admin/vehicles/xyz-456")).toEqual({ vehicleId: "xyz-456" });
  });

  it("ジョブ詳細ページ → jobId を抽出", () => {
    expect(inferCreateContext("/admin/jobs/def-789")).toEqual({ jobId: "def-789" });
  });

  it("一覧ページ → 空オブジェクト", () => {
    expect(inferCreateContext("/admin/customers")).toEqual({});
  });

  it("ダッシュボード → 空オブジェクト", () => {
    expect(inferCreateContext("/admin")).toEqual({});
  });

  it("サブルートは対象外（顧客のサブページ等）", () => {
    // /admin/customers/abc-123/edit のようなサブルートはマッチしない
    expect(inferCreateContext("/admin/customers/abc-123/edit")).toEqual({});
  });

  // "new" は作成画面自体のパスセグメントであって ID ではない。
  // 除外しないと vehicleId="new" のような存在しない ID が紛れ込む。
  it("/new ページは ID として拾わない（顧客・車両・ジョブ）", () => {
    expect(inferCreateContext("/admin/customers/new")).toEqual({});
    expect(inferCreateContext("/admin/vehicles/new")).toEqual({});
    expect(inferCreateContext("/admin/jobs/new")).toEqual({});
  });
});

describe("applyCreateContext()", () => {
  it("コンテキストなし → href そのまま", () => {
    expect(applyCreateContext("/admin/reservations/new", {})).toBe("/admin/reservations/new");
  });

  it("customerId → クエリパラメータ付与", () => {
    expect(applyCreateContext("/admin/reservations/new", { customerId: "abc" })).toBe(
      "/admin/reservations/new?customerId=abc",
    );
  });

  it("複数コンテキスト → 複数パラメータ", () => {
    const result = applyCreateContext("/admin/reservations/new", { customerId: "a", vehicleId: "b" });
    expect(result).toContain("customerId=a");
    expect(result).toContain("vehicleId=b");
  });

  // href 側が既に ?create=1 を持つ場合（予約・顧客）に `?` が2つできると
  // 不正な URL になる。`&` で連結すること。
  it("href が既にクエリを持つ場合は & で連結する（? を2つ作らない）", () => {
    expect(applyCreateContext("/admin/reservations?create=1", { customerId: "abc" })).toBe(
      "/admin/reservations?create=1&customerId=abc",
    );
  });
});

// ── ワークスコープ ──

describe("ワークスコープ", () => {
  it("3 段階: self / store / all_stores", () => {
    expect(WORK_SCOPES).toEqual(["self", "store", "all_stores"]);
  });

  it("全スコープに日本語ラベルがある", () => {
    for (const scope of WORK_SCOPES) {
      expect(WORK_SCOPE_LABELS[scope]).toBeTruthy();
    }
  });
});

describe("availableScopes()", () => {
  it("owner → 全 3 段階", () => {
    expect(availableScopes("owner")).toEqual(WORK_SCOPES);
  });

  it("admin → 全 3 段階", () => {
    expect(availableScopes("admin")).toEqual(WORK_SCOPES);
  });

  it("staff → self / store の 2 段階", () => {
    expect(availableScopes("staff")).toEqual(["self", "store"]);
  });

  it("viewer → self のみ", () => {
    expect(availableScopes("viewer")).toEqual(["self"]);
  });
});

describe("defaultScope()", () => {
  it("owner → store", () => {
    expect(defaultScope("owner")).toBe("store");
  });

  it("admin → store", () => {
    expect(defaultScope("admin")).toBe("store");
  });

  it("staff → self", () => {
    expect(defaultScope("staff")).toBe("self");
  });

  it("viewer → self", () => {
    expect(defaultScope("viewer")).toBe("self");
  });
});
