import { describe, it, expect } from "vitest";
import {
  JOB_TRANSITIONS,
  STEP_TRANSITIONS,
  SEVERITY_TRANSITIONS,
  CERTIFICATE_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  SYNC_TRANSITIONS,
  isValidTransition,
  validNextStates,
  isTerminalState,
  rejectTransition,
} from "../transitions";
import { JOB_STATES, STEP_STATES, SEVERITIES, CERTIFICATE_STATES, PAYMENT_STATES, SYNC_STATES } from "../states";
import { CERTIFICATE_GATE_CONDITIONS, isCertificateGateCondition } from "../certificateGate";

// ── 遷移表の構造テスト ──

const AXES = [
  { name: "job", table: JOB_TRANSITIONS, states: JOB_STATES },
  { name: "step", table: STEP_TRANSITIONS, states: STEP_STATES },
  { name: "severity", table: SEVERITY_TRANSITIONS, states: SEVERITIES },
  { name: "certificate", table: CERTIFICATE_TRANSITIONS, states: CERTIFICATE_STATES },
  { name: "payment", table: PAYMENT_TRANSITIONS, states: PAYMENT_STATES },
  { name: "sync", table: SYNC_TRANSITIONS, states: SYNC_STATES },
] as const;

describe("遷移表の構造", () => {
  it.each(AXES)("$name: 全正準値にエントリがある（漏れなし）", ({ table, states }) => {
    for (const s of states) {
      expect(table).toHaveProperty(s);
    }
  });

  it.each(AXES)("$name: 遷移先はすべて正準値（不正値の混入なし）", ({ table, states }) => {
    const valid: ReadonlySet<string> = new Set(states);
    for (const [from, targets] of Object.entries(table)) {
      for (const to of targets as string[]) {
        expect(valid.has(to), `${from} → ${to} is not a valid state`).toBe(true);
      }
    }
  });

  it.each(AXES)("$name: 自己遷移（A→A）は含まない", ({ table }) => {
    for (const [from, targets] of Object.entries(table)) {
      expect((targets as string[]).includes(from), `${from} → ${from} self-transition`).toBe(false);
    }
  });

  it.each(AXES)("$name: 遷移先に重複がない", ({ table }) => {
    for (const [from, targets] of Object.entries(table)) {
      expect(new Set(targets as string[]).size, `${from} has duplicate targets`).toBe((targets as string[]).length);
    }
  });
});

// ── 案件（Job）遷移 ──

describe("JOB_TRANSITIONS", () => {
  it("SCHEDULED → CHECKED_IN（入庫）は有効", () => {
    expect(isValidTransition(JOB_TRANSITIONS, "SCHEDULED", "CHECKED_IN")).toBe(true);
  });

  it("VERIFIED は終端（遷移先なし）", () => {
    expect(isTerminalState(JOB_TRANSITIONS, "VERIFIED")).toBe(true);
    expect(validNextStates(JOB_TRANSITIONS, "VERIFIED")).toEqual([]);
  });

  it("CANCELED は終端", () => {
    expect(isTerminalState(JOB_TRANSITIONS, "CANCELED")).toBe(true);
  });

  it("NO_SHOW → SCHEDULED（再予約）のみ", () => {
    expect(validNextStates(JOB_TRANSITIONS, "NO_SHOW")).toEqual(["SCHEDULED"]);
  });

  it("VERIFIED → IN_PROGRESS は無効（完了後に戻れない）", () => {
    expect(isValidTransition(JOB_TRANSITIONS, "VERIFIED", "IN_PROGRESS")).toBe(false);
  });

  it("CANCELED からはどこにも遷移できない", () => {
    for (const s of JOB_STATES) {
      expect(isValidTransition(JOB_TRANSITIONS, "CANCELED", s)).toBe(false);
    }
  });
});

// ── 支払い（Payment）遷移 ──

describe("PAYMENT_TRANSITIONS", () => {
  it("UNKNOWN → PENDING は禁止（v2.0 §11.3: UNKNOWN 中は再決済しない）", () => {
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PENDING")).toBe(false);
  });

  it("UNKNOWN → PAID は有効（確認後に確定）", () => {
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PAID")).toBe(true);
  });

  it("REFUNDED は終端", () => {
    expect(isTerminalState(PAYMENT_TRANSITIONS, "REFUNDED")).toBe(true);
  });

  it("PARTIALLY_REFUNDED → REFUNDED のみ（完全返金への遷移）", () => {
    expect(validNextStates(PAYMENT_TRANSITIONS, "PARTIALLY_REFUNDED")).toEqual(["REFUNDED"]);
  });
});

// ── 証明書（Certificate）遷移 ──

describe("CERTIFICATE_TRANSITIONS", () => {
  it("NOT_READY → READY のみ（Gate 通過）", () => {
    expect(validNextStates(CERTIFICATE_TRANSITIONS, "NOT_READY")).toEqual(["READY"]);
  });

  it("線形パス: NOT_READY → READY → ISSUING → VERIFYING → VERIFIED", () => {
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "NOT_READY", "READY")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "READY", "ISSUING")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "ISSUING", "VERIFYING")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "VERIFYING", "VERIFIED")).toBe(true);
  });

  it("VERIFYING → PENDING_CORRECTION（修正要求）は有効", () => {
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "VERIFYING", "PENDING_CORRECTION")).toBe(true);
  });

  it("PENDING_CORRECTION → ISSUING（修正版発行）は有効", () => {
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "ISSUING")).toBe(true);
  });

  it("SUPERSEDED / REVOKED は終端", () => {
    expect(isTerminalState(CERTIFICATE_TRANSITIONS, "SUPERSEDED")).toBe(true);
    expect(isTerminalState(CERTIFICATE_TRANSITIONS, "REVOKED")).toBe(true);
  });
});

// ── 緊急度（Severity）遷移 ──

describe("SEVERITY_TRANSITIONS", () => {
  it("CRITICAL → NORMAL は禁止（段階的降格のみ）", () => {
    expect(isValidTransition(SEVERITY_TRANSITIONS, "CRITICAL", "NORMAL")).toBe(false);
  });

  it("CRITICAL → HIGH は有効（一段降格）", () => {
    expect(isValidTransition(SEVERITY_TRANSITIONS, "CRITICAL", "HIGH")).toBe(true);
  });

  it("RESOLVED → 再開は全レベルへ可能", () => {
    expect(isValidTransition(SEVERITY_TRANSITIONS, "RESOLVED", "NORMAL")).toBe(true);
    expect(isValidTransition(SEVERITY_TRANSITIONS, "RESOLVED", "CRITICAL")).toBe(true);
  });
});

// ── 同期（Sync）遷移 ──

describe("SYNC_TRANSITIONS", () => {
  it("SYNCING → CONFLICT は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "SYNCING", "CONFLICT")).toBe(true);
  });

  it("CONFLICT → PENDING（解決→再同期）は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "CONFLICT", "PENDING")).toBe(true);
  });

  it("FAILED → PENDING（リトライ）は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "FAILED", "PENDING")).toBe(true);
  });
});

// ── ステップ（Step）遷移 ──

describe("STEP_TRANSITIONS", () => {
  it("COMPLETED / SKIPPED / CANCELED は終端", () => {
    expect(isTerminalState(STEP_TRANSITIONS, "COMPLETED")).toBe(true);
    expect(isTerminalState(STEP_TRANSITIONS, "SKIPPED")).toBe(true);
    expect(isTerminalState(STEP_TRANSITIONS, "CANCELED")).toBe(true);
  });

  it("WAITING_APPROVAL → COMPLETED（承認）/ IN_PROGRESS（差し戻し）は有効", () => {
    expect(isValidTransition(STEP_TRANSITIONS, "WAITING_APPROVAL", "COMPLETED")).toBe(true);
    expect(isValidTransition(STEP_TRANSITIONS, "WAITING_APPROVAL", "IN_PROGRESS")).toBe(true);
  });
});

// ── 汎用関数テスト ──

describe("rejectTransition()", () => {
  it("有効な遷移は null を返す", () => {
    expect(rejectTransition(JOB_TRANSITIONS, "job", "SCHEDULED", "CHECKED_IN")).toBeNull();
  });

  it("終端状態からの遷移は理由に「終端状態」を含む", () => {
    const r = rejectTransition(JOB_TRANSITIONS, "job", "VERIFIED", "IN_PROGRESS");
    expect(r).not.toBeNull();
    expect(r!.from).toBe("VERIFIED");
    expect(r!.to).toBe("IN_PROGRESS");
    expect(r!.axis).toBe("job");
    expect(r!.reason).toContain("終端状態");
  });

  it("非終端からの無効遷移は有効な遷移先を理由に含む", () => {
    const r = rejectTransition(JOB_TRANSITIONS, "job", "SCHEDULED", "VERIFIED");
    expect(r).not.toBeNull();
    expect(r!.reason).toContain("CHECKED_IN");
  });
});

// ── Certificate Gate 条件 ──

describe("CertificateGateCondition", () => {
  it("10 条件が定義されている（v2.0 §19.4）", () => {
    expect(CERTIFICATE_GATE_CONDITIONS).toHaveLength(10);
  });

  it("重複なし", () => {
    expect(new Set(CERTIFICATE_GATE_CONDITIONS).size).toBe(10);
  });

  it("型ガードが有効な条件を受理する", () => {
    expect(isCertificateGateCondition("workflow_completed")).toBe(true);
    expect(isCertificateGateCondition("parts_integrity")).toBe(true);
  });

  it("型ガードが無効な値を拒否する", () => {
    expect(isCertificateGateCondition("unknown_condition")).toBe(false);
    expect(isCertificateGateCondition(null)).toBe(false);
  });
});
