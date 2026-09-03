import { describe, it, expect } from "vitest";
import {
  JOB_TRANSITIONS,
  STEP_TRANSITIONS,
  SEVERITY_TRANSITIONS,
  CERTIFICATE_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  SYNC_TRANSITIONS,
  PART_INSTALLATION_TRANSITIONS,
  DOCUMENT_CORRECTION_TRANSITIONS,
  isValidTransition,
  validNextStates,
  isTerminalState,
  isKnownState,
  rejectTransition,
} from "../transitions";
import type { JobState, PartInstallationState, DocumentCorrectionState } from "../states";
import {
  JOB_STATES,
  STEP_STATES,
  SEVERITIES,
  CERTIFICATE_STATES,
  PAYMENT_STATES,
  SYNC_STATES,
  PART_INSTALLATION_STATES,
  DOCUMENT_CORRECTION_STATES,
  isPartInstallationState,
  isDocumentCorrectionState,
} from "../states";
import { CERTIFICATE_GATE_CONDITIONS, isCertificateGateCondition } from "../certificateGate";

// ── 遷移表の構造テスト ──

const AXES = [
  { name: "job", table: JOB_TRANSITIONS, states: JOB_STATES },
  { name: "step", table: STEP_TRANSITIONS, states: STEP_STATES },
  { name: "severity", table: SEVERITY_TRANSITIONS, states: SEVERITIES },
  { name: "certificate", table: CERTIFICATE_TRANSITIONS, states: CERTIFICATE_STATES },
  { name: "payment", table: PAYMENT_TRANSITIONS, states: PAYMENT_STATES },
  { name: "sync", table: SYNC_TRANSITIONS, states: SYNC_STATES },
  { name: "partInstallation", table: PART_INSTALLATION_TRANSITIONS, states: PART_INSTALLATION_STATES },
  { name: "documentCorrection", table: DOCUMENT_CORRECTION_TRANSITIONS, states: DOCUMENT_CORRECTION_STATES },
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

  // 代表判断（2026-08-27）: 照合で部分入金・過入金だったと判明するケースがある。
  it("UNKNOWN → PARTIALLY_PAID / OVERPAID は有効（照合で部分・過入金と判明）", () => {
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PARTIALLY_PAID")).toBe(true);
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "OVERPAID")).toBe(true);
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

  it("PENDING_CORRECTION → Gate 再評価（READY / NOT_READY）へ戻る", () => {
    // 以前は ISSUING へ直行していたが、それは Gate バイパスに当たる
    // （ADR-0005 決定4）。訂正でどの条件が崩れたかは評価器が決める。
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "READY")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "NOT_READY")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "ISSUING")).toBe(false);
  });

  it("SUPERSEDED / REVOKED は終端", () => {
    expect(isTerminalState(CERTIFICATE_TRANSITIONS, "SUPERSEDED")).toBe(true);
    expect(isTerminalState(CERTIFICATE_TRANSITIONS, "REVOKED")).toBe(true);
  });

  // 代表判断（2026-08-27）: 公開前でも重大な問題が起きた記録を残す必要がある。
  it("ISSUING / VERIFYING → REVOKED は有効（公開前の無効化記録）", () => {
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "ISSUING", "REVOKED")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "VERIFYING", "REVOKED")).toBe(true);
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

  // 代表判断（2026-08-27）: CRITICAL → NORMAL の直行のみ禁止という読み方で確定。
  it("CRITICAL → ACTION は有効（一段ずつでない部分的な降格も許可）", () => {
    expect(isValidTransition(SEVERITY_TRANSITIONS, "CRITICAL", "ACTION")).toBe(true);
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
  it("SKIPPED / CANCELED は終端。COMPLETED は手戻りで再開できる", () => {
    expect(isTerminalState(STEP_TRANSITIONS, "SKIPPED")).toBe(true);
    expect(isTerminalState(STEP_TRANSITIONS, "CANCELED")).toBe(true);
    // COMPLETED を終端にすると、案件が IN_PROGRESS へ戻ったときに
    // やり直す対象が1つも無い状態になる（JOB_TRANSITIONS は手戻りを許している）。
    expect(isTerminalState(STEP_TRANSITIONS, "COMPLETED")).toBe(false);
    expect(validNextStates(STEP_TRANSITIONS, "COMPLETED")).toEqual(["IN_PROGRESS"]);
  });

  it("WAITING_APPROVAL → COMPLETED（承認）/ IN_PROGRESS（差し戻し）は有効", () => {
    expect(isValidTransition(STEP_TRANSITIONS, "WAITING_APPROVAL", "COMPLETED")).toBe(true);
    expect(isValidTransition(STEP_TRANSITIONS, "WAITING_APPROVAL", "IN_PROGRESS")).toBe(true);
  });

  // 代表判断（2026-08-27）: 着手後に不要と判明する運用がある。
  it("IN_PROGRESS / BLOCKED → SKIPPED は有効（着手後に不要と判明）", () => {
    expect(isValidTransition(STEP_TRANSITIONS, "IN_PROGRESS", "SKIPPED")).toBe(true);
    expect(isValidTransition(STEP_TRANSITIONS, "BLOCKED", "SKIPPED")).toBe(true);
  });
});

// ── 部品装着（PartInstallation）遷移 ──

describe("PART_INSTALLATION_TRANSITIONS", () => {
  it("DRAFT → INSTALLED のみ許可", () => {
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DRAFT", "INSTALLED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DRAFT", "CUSTOMER_VERIFIED")).toBe(false);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DRAFT", "VOIDED")).toBe(false);
  });

  it("INSTALLED → CUSTOMER_VERIFIED / DISPUTED / VOIDED を許可", () => {
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "INSTALLED", "CUSTOMER_VERIFIED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "INSTALLED", "DISPUTED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "INSTALLED", "VOIDED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "INSTALLED", "DRAFT")).toBe(false);
  });

  it("CUSTOMER_VERIFIED → VOIDED のみ許可（完全凍結の唯一の例外）", () => {
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "CUSTOMER_VERIFIED", "VOIDED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "CUSTOMER_VERIFIED", "INSTALLED")).toBe(false);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "CUSTOMER_VERIFIED", "DISPUTED")).toBe(false);
  });

  it("DISPUTED → CUSTOMER_VERIFIED / VOIDED を許可", () => {
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DISPUTED", "CUSTOMER_VERIFIED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DISPUTED", "VOIDED")).toBe(true);
    expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, "DISPUTED", "INSTALLED")).toBe(false);
  });

  it("VOIDED は終端状態", () => {
    expect(isTerminalState(PART_INSTALLATION_TRANSITIONS, "VOIDED")).toBe(true);
    expect(validNextStates(PART_INSTALLATION_TRANSITIONS, "VOIDED")).toEqual([]);
  });

  it("遷移表のキーと値はすべて正準値", () => {
    for (const [from, targets] of Object.entries(PART_INSTALLATION_TRANSITIONS)) {
      expect(isPartInstallationState(from)).toBe(true);
      for (const to of targets as readonly string[]) {
        expect(isPartInstallationState(to)).toBe(true);
      }
    }
  });

  it("Object.prototype 由来のキーで例外を投げない（プロトタイプ汚染防止）", () => {
    const bad = (v: string) => v as unknown as PartInstallationState;
    for (const k of ["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf"]) {
      expect(() => isValidTransition(PART_INSTALLATION_TRANSITIONS, bad(k), "VOIDED")).not.toThrow();
      expect(isValidTransition(PART_INSTALLATION_TRANSITIONS, bad(k), "VOIDED")).toBe(false);
    }
  });
});

// ── 帳票訂正リクエスト（DocumentCorrection）遷移 ADR-0004 ──

describe("DOCUMENT_CORRECTION_TRANSITIONS", () => {
  it("PENDING → APPROVED / REJECTED のみ許可", () => {
    expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "PENDING", "APPROVED")).toBe(true);
    expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "PENDING", "REJECTED")).toBe(true);
    expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "PENDING", "APPLIED")).toBe(false);
  });

  it("APPROVED → APPLIED のみ許可", () => {
    expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "APPROVED", "APPLIED")).toBe(true);
    expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "APPROVED", "PENDING")).toBe(false);
  });

  it("REJECTED / APPLIED は終端状態", () => {
    expect(isTerminalState(DOCUMENT_CORRECTION_TRANSITIONS, "REJECTED")).toBe(true);
    expect(isTerminalState(DOCUMENT_CORRECTION_TRANSITIONS, "APPLIED")).toBe(true);
    for (const target of DOCUMENT_CORRECTION_STATES) {
      expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "REJECTED", target)).toBe(false);
      expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, "APPLIED", target)).toBe(false);
    }
  });

  it("遷移表のキーと値はすべて正準値", () => {
    for (const [from, targets] of Object.entries(DOCUMENT_CORRECTION_TRANSITIONS)) {
      expect(isDocumentCorrectionState(from)).toBe(true);
      for (const to of targets as readonly string[]) {
        expect(isDocumentCorrectionState(to)).toBe(true);
      }
    }
  });

  it("Object.prototype 由来のキーで例外を投げない（プロトタイプ汚染防止）", () => {
    const bad = (v: string) => v as unknown as DocumentCorrectionState;
    for (const k of ["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf"]) {
      expect(() => isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, bad(k), "APPLIED")).not.toThrow();
      expect(isValidTransition(DOCUMENT_CORRECTION_TRANSITIONS, bad(k), "APPLIED")).toBe(false);
    }
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

// 型は正準値に絞っていても、実行時に来るのはクライアント由来の文字列。
// Object.prototype 由来のキーと、稼働中の既存語彙（reservations.status の
// completed / in_progress）を入れたときの振る舞いを固定する。
describe("表に無い状態を渡したとき", () => {
  // 型の外の値をわざと入れる。`@ts-expect-error` は使わない ——
  // 別の型エラー（未 import など）まで一緒に吸ってしまうため。
  const bad = (v: string) => v as unknown as JobState;

  it("Object.prototype 由来のキーで例外を投げない", () => {
    for (const k of ["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf"]) {
      expect(() => isValidTransition(JOB_TRANSITIONS, bad(k), "VERIFIED")).not.toThrow();
      expect(isValidTransition(JOB_TRANSITIONS, bad(k), "VERIFIED")).toBe(false);
      expect(validNextStates(JOB_TRANSITIONS, bad(k))).toEqual([]);
    }
  });

  it("未知の状態を終端と答えない", () => {
    // 既存の稼働中語彙。正準値と暗黙に同一視しない（CLAUDE.md）
    for (const k of ["completed", "in_progress", "toString", "cancelled"]) {
      expect(isTerminalState(JOB_TRANSITIONS, bad(k))).toBe(false);
      expect(isKnownState(JOB_TRANSITIONS, bad(k))).toBe(false);
    }
    // 本物の終端は true のまま
    expect(isTerminalState(JOB_TRANSITIONS, "VERIFIED")).toBe(true);
    expect(isKnownState(JOB_TRANSITIONS, "VERIFIED")).toBe(true);
  });

  it("拒否理由が「終端」ではなく「未定義」と言う", () => {
    const r = rejectTransition(JOB_TRANSITIONS, "job", bad("completed"), "VERIFIED");
    expect(r).not.toBeNull();
    expect(r!.reason).toContain("定義されていません");
    expect(r!.reason).not.toContain("終端");
  });
});

// 現場の操作が遷移表で表せることを固定する。
// どの期待値も、リポジトリの中に根拠がある（ADR・稼働中コード・同ファイル内の整合）。
describe("現場の操作が表せること", () => {
  it("店頭の現金入金を1手で記録できる（UNPAID → PAID）", () => {
    // 根拠: admin/invoices/StorefrontBilling.tsx の「入金を記録 (本日)」が
    // 未入金の請求書へ status:"paid" を直接書いている。
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNPAID", "PAID")).toBe(true);
    // 頭金も同じ経路。payment_entries は総額未満の金額を記録できる。
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNPAID", "PARTIALLY_PAID")).toBe(true);
  });

  it("照合で「入金されていなかった」と確定できる（UNKNOWN → UNPAID）", () => {
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "UNPAID")).toBe(true);
    // §11.3 が禁じるのは「UNKNOWN のまま再決済」。UNKNOWN から直接 PENDING は塞いだまま。
    expect(isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PENDING")).toBe(false);
  });

  it("発行・検証ジョブが失敗しても戻れる（固まらない）", () => {
    // 根拠: ADR-0005 決定3。ISSUING / VERIFYING はバックエンドのジョブが動かす。
    expect(isTerminalState(CERTIFICATE_TRANSITIONS, "ISSUING")).toBe(false);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "ISSUING", "READY")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "VERIFYING", "ISSUING")).toBe(true);
  });

  it("Gate 条件が後から崩れたら READY から降りられる", () => {
    // 根拠: ADR-0005 決定1 の 10 条件には、後から崩れうるものが含まれる。
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "READY", "NOT_READY")).toBe(true);
  });

  it("訂正版は Gate を通り直す（ISSUING へ直行しない）", () => {
    // 根拠: ADR-0005 決定4。Gate バイパスは代表の明示的な承認なしに行わない。
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "ISSUING")).toBe(false);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "READY")).toBe(true);
    expect(isValidTransition(CERTIFICATE_TRANSITIONS, "PENDING_CORRECTION", "NOT_READY")).toBe(true);
  });

  it("軽微な指摘を昇格させずに閉じられる（NORMAL → RESOLVED）", () => {
    expect(isValidTransition(SEVERITY_TRANSITIONS, "NORMAL", "RESOLVED")).toBe(true);
    // 表の唯一の禁止は CRITICAL → NORMAL の直接降格。コメントと表を一致させた。
    expect(isValidTransition(SEVERITY_TRANSITIONS, "CRITICAL", "NORMAL")).toBe(false);
    expect(isValidTransition(SEVERITY_TRANSITIONS, "CRITICAL", "HIGH")).toBe(true);
    expect(isValidTransition(SEVERITY_TRANSITIONS, "HIGH", "NORMAL")).toBe(true);
  });

  it("手戻りした案件の工程を再開できる", () => {
    // 根拠: 同じファイルの JOB_TRANSITIONS が手戻りを許している。
    expect(isValidTransition(JOB_TRANSITIONS, "CERTIFICATE_PROCESSING", "WAITING_REVIEW")).toBe(true);
    expect(isValidTransition(JOB_TRANSITIONS, "WAITING_REVIEW", "IN_PROGRESS")).toBe(true);
    // 案件が戻れるなら、工程も戻れないと「やり直す対象が1つも無い」状態になる。
    expect(isValidTransition(STEP_TRANSITIONS, "COMPLETED", "IN_PROGRESS")).toBe(true);
  });

  it("中断した同期を積み直せる（嘘の FAILED を書かない）", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "SYNCING", "PENDING")).toBe(true);
  });

  it("入庫済みの案件は「来店なし」にできない", () => {
    expect(isValidTransition(JOB_TRANSITIONS, "CHECKED_IN", "NO_SHOW")).toBe(false);
    // 誤操作の抜け道は CANCELED。
    expect(isValidTransition(JOB_TRANSITIONS, "CHECKED_IN", "CANCELED")).toBe(true);
    // 来店前なら NO_SHOW は正しい。
    expect(isValidTransition(JOB_TRANSITIONS, "SCHEDULED", "NO_SHOW")).toBe(true);
  });
});
