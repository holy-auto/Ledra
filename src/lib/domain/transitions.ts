/**
 * 正準状態遷移表（IMP-015）。
 *
 * v2.0 §19: 各正準状態軸の有効な遷移を定義し、無効な遷移を構造的に拒否する。
 *
 * 目的:
 * - 8 軸（Job / Step / Severity / Certificate / Payment / Sync / PartInstallation /
 *   DocumentCorrection）の遷移可否の単一定義源
 * - 無効遷移の拒否理由メッセージ
 * - 終端状態の明示（遷移先なし = terminal）
 *
 * 既存の signoff 状態機械（src/lib/signoff/state.ts）はワークフロー計算
 * （「いつ・なぜ遷移するか」）であり、ここで定義するのは構造的制約
 * （「何から何へ遷移できるか」）。両者は補完関係。
 *
 * 未解決だった4件は代表判断で解決済み（2026-08-27、DECISION_LOG参照）:
 * 1. REVOKED は ISSUING / VERIFYING からも遷移可（公開前でも無効化の記録を残す）。
 * 2. UNKNOWN → PARTIALLY_PAID / OVERPAID を追加（照合で部分・過入金の判明があり得る）。
 * 3. IN_PROGRESS / BLOCKED → SKIPPED を許可（着手後に不要と判明する運用がある）。
 * 4. Severity の CRITICAL → ACTION は許可のまま（現状の表を正とする。
 *    NORMAL への直接降格のみ禁止という読み方で確定）。
 *
 * 既存値→正準値のマッピングについて（ADR-0002 の IMP-015 判断事項）:
 * TS 層マッピングは各消費タスク（IMP-028 証明書 / IMP-031 案件状態 /
 * IMP-027 支払い）で段階的に導入する。ここでは遷移表のみ定義し、
 * 変換関数は作らない（誤った同一視の焼き込み防止を維持）。
 */

import type {
  JobState,
  StepState,
  Severity,
  CertificateState,
  PaymentState,
  SyncState,
  PartInstallationState,
  DocumentCorrectionState,
} from "./states";

// ── 案件（Job）遷移表 v2.0 §19.1 ──

export const JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  SCHEDULED: ["CHECKED_IN", "CANCELED", "NO_SHOW"],
  // NO_SHOW は入れない。**入庫済みの案件は「来店なし」になりえない。**
  // 誤操作で CHECKED_IN にしてしまった場合は CANCELED で抜ける。
  // （NO_SHOW の抜け先は SCHEDULED だけなので、通すと入庫の記録が消える）
  CHECKED_IN: ["IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["PAUSED", "WAITING_REVIEW", "WAITING_CUSTOMER", "PARTIALLY_COMPLETED", "CANCELED"],
  PAUSED: ["IN_PROGRESS", "CANCELED"],
  WAITING_REVIEW: ["IN_PROGRESS", "WAITING_PAYMENT", "CERTIFICATE_PROCESSING", "CANCELED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELED"],
  WAITING_PAYMENT: ["CERTIFICATE_PROCESSING", "CANCELED"],
  CERTIFICATE_PROCESSING: ["VERIFIED", "WAITING_REVIEW"],
  VERIFIED: [],
  CANCELED: [],
  NO_SHOW: ["SCHEDULED"],
  PARTIALLY_COMPLETED: ["IN_PROGRESS", "CERTIFICATE_PROCESSING", "CANCELED"],
};

// ── 作業ステップ遷移表 v2.0 §19.2 ──

export const STEP_TRANSITIONS: Record<StepState, readonly StepState[]> = {
  NOT_STARTED: ["READY", "SKIPPED", "CANCELED"],
  READY: ["IN_PROGRESS", "SKIPPED", "CANCELED"],
  // SKIPPED も可（代表判断・2026-08-27）: 着手後に不要と判明する運用がある。
  IN_PROGRESS: ["BLOCKED", "WAITING_APPROVAL", "COMPLETED", "SKIPPED", "CANCELED"],
  BLOCKED: ["IN_PROGRESS", "SKIPPED", "CANCELED"],
  WAITING_APPROVAL: ["COMPLETED", "IN_PROGRESS", "CANCELED"],
  // **終端にしない。**同じファイルの JOB_TRANSITIONS が手戻りを許しており
  // （CERTIFICATE_PROCESSING → WAITING_REVIEW → IN_PROGRESS）、案件が
  // IN_PROGRESS へ戻ったのに全工程が COMPLETED のままだと、やり直す対象が
  // 1つも無いという状態になる。ADR-0004 の訂正フローでも同じ形になる。
  COMPLETED: ["IN_PROGRESS"],
  SKIPPED: [],
  CANCELED: [],
};

// ── 緊急度（Severity）遷移表 v2.0 §19.3 ──
// ponytail: Severity はライフサイクル状態ではなく分類レベル。
// 遷移表はあるが制約は緩い（再評価で自由に変更可能）。
// **禁止するのは CRITICAL → NORMAL の直接降格だけ**（段階的に下げる）。
//
// 以前はこのコメントと表が食い違っていた —— 表は NORMAL → RESOLVED、
// HIGH → NORMAL、CRITICAL → ACTION も塞いでおり、**軽微な指摘を閉じるのに
// いったん昇格させるしかない**形になっていた。表をコメントの規則に合わせる。

export const SEVERITY_TRANSITIONS: Record<Severity, readonly Severity[]> = {
  NORMAL: ["ACTION", "HIGH", "CRITICAL", "RESOLVED"],
  ACTION: ["NORMAL", "HIGH", "CRITICAL", "RESOLVED"],
  HIGH: ["NORMAL", "ACTION", "CRITICAL", "RESOLVED"],
  CRITICAL: ["ACTION", "HIGH", "RESOLVED"], // NORMAL への直接降格のみ禁止
  RESOLVED: ["NORMAL", "ACTION", "HIGH", "CRITICAL"],
};

// ── 証明書（Certificate）遷移表 v2.0 §12.2 ──

// READY は「Gate の 10 条件をすべて満たした」状態（ADR-0005 決定1）。
// ISSUING / VERIFYING は**バックエンドのジョブ**が動かす（ADR-0005 決定3:
// 「状態遷移は冪等なバックエンド処理(ジョブ/イベント)経由でのみ起きる」）。
// ジョブは失敗する（PDF 生成・C2PA 署名・アンカリング）ので、戻り先が要る。

export const CERTIFICATE_TRANSITIONS: Record<CertificateState, readonly CertificateState[]> = {
  NOT_READY: ["READY"],
  // NOT_READY へ戻れる。**Gate の条件は後から崩れる** —— 未解決 Integrity Alert が
  // 立つ、証跡の同期が競合する、顧客確認が現行版でなくなる、未処理の訂正が生まれる
  // （ADR-0005 決定1 の 10 条件）。戻れないと、Gate が false を返しているのに
  // READY → ISSUING が有効なままになり、**条件を満たさない証明書を発行できてしまう。**
  READY: ["ISSUING", "NOT_READY"],
  // 発行ジョブが失敗したら READY へ戻して再試行する。Gate 自体は満たしたままなので
  // NOT_READY ではなく READY。条件が崩れていれば READY → NOT_READY が拾う。
  // REVOKED も可（代表判断・2026-08-27）: 公開前でも重大な問題が起きた記録を残す。
  ISSUING: ["VERIFYING", "READY", "REVOKED"],
  // 検証ジョブが失敗したら ISSUING からやり直す。REVOKED は上記 ISSUING と同じ理由。
  VERIFYING: ["VERIFIED", "PENDING_CORRECTION", "ISSUING", "REVOKED"],
  VERIFIED: ["SUPERSEDED", "REVOKED"],
  // **ISSUING へ直行させない。**READY を飛ばすと、訂正で崩れたかもしれない
  // Gate 条件（必須証跡・必要承認・未処理訂正なし）を再評価しないまま発行することになり、
  // ADR-0005 決定4 の「Gate 条件の緩和・バイパスに相当する変更は代表の明示的な
  // 承認なしに行わない」に当たる。訂正後はもう一度 Gate に入れ、評価器が
  // READY / NOT_READY のどちらへ置くかを決める。
  PENDING_CORRECTION: ["READY", "NOT_READY"],
  SUPERSEDED: [],
  REVOKED: [],
};

// ── 支払い（Payment）遷移表 v2.0 §11.2 ──
// ponytail: UNKNOWN は「結果不明」。**UNKNOWN のまま再決済（盲目リトライ）を
// 発火させない**（v2.0 §11.3、states.ts のコメント）。禁じているのは「不明なまま
// もう一度課金する」ことであって、照合して結果を確定させることではない。

export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  // **店頭の現金・振込は1手で記録する。**稼働中の
  // `admin/invoices/StorefrontBilling.tsx` の「入金を記録 (本日)」は、未入金の
  // 請求書に対して `status: "paid"` を直接書いている。`payment_entries` も
  // `payment_method` の既定が `cash` で、頭金（総額未満）を記録できる。
  // PENDING を必ず経由させると、**一度も処理中でなかった支払いに架空の
  // PENDING を書く**ことになる。
  UNPAID: ["PENDING", "PAID", "PARTIALLY_PAID", "CANCELED"],
  PENDING: ["PAID", "PARTIALLY_PAID", "UNKNOWN", "CANCELED"],
  PARTIALLY_PAID: ["PENDING", "PAID", "REFUNDED", "PARTIALLY_REFUNDED", "CANCELED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED", "OVERPAID"],
  OVERPAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  CANCELED: [],
  // **照合で「入金されていなかった」と分かったら UNPAID へ戻す。**
  // これが無いと、書ける先が PAID（受け取っていない金を受領済みにする）か
  // CANCELED（キャンセルされた、という別の意味）しかない。
  // UNPAID へ落ちた後の UNPAID → PENDING は、結果が**確定した後**の再請求なので
  // §11.3 が禁じる「UNKNOWN のままの盲目リトライ」には当たらない。
  // PARTIALLY_PAID / OVERPAID も可（代表判断・2026-08-27）: 照合で部分入金・
  // 過入金だったと判明するケースが実際にある。
  UNKNOWN: ["PAID", "UNPAID", "PARTIALLY_PAID", "OVERPAID", "CANCELED"],
};

// ── 同期（Sync）遷移表 v2.0 §14.2 ──

export const SYNC_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  SYNCED: ["PENDING"],
  PENDING: ["SYNCING"],
  // **PENDING へ積み直せる。**アプリやワーカーが送信中に落ちると、行は SYNCING の
  // まま実際の通信は消えている。復帰時のスイープはこれを再試行キューへ戻すが、
  // PENDING へ戻せないと FAILED を経由するしかない —— FAILED は「サーバに
  // 拒否された」という意味で、**起きていないことを記録する**ことになる。
  SYNCING: ["SYNCED", "FAILED", "CONFLICT", "PENDING"],
  FAILED: ["PENDING"],
  CONFLICT: ["PENDING"],
};

// ── 部品装着（PartInstallation）遷移表 v2.0 §8（IMP-040） ──
//
// これは states.ts の JSDoc が説明する「業務レベルの状態機械」（DRAFT → INSTALLED →
// CUSTOMER_VERIFIED、DISPUTED は別枝、VOIDED は理由必須の唯一の脱出口）であり、
// DB の完全凍結ガード（supabase/migrations/20260603000001_part_installations_guard.sql
// の part_installations_guard トリガー）とはスコープが異なる。DB 側は
// 「customer_verified 到達後の不変性」と「customer_verified への到達に署名・
// document_hash 一致・電話一致・保証グレード充足のゲートを課す」ことしか強制しておらず、
// DRAFT→DISPUTED や DRAFT→VOIDED のような、この表が禁止する遷移までは DB は拒否しない
// （この表の方が厳しい）。両者は補完関係であり、どちらか一方が他方の代替にはならない。
export const PART_INSTALLATION_TRANSITIONS: Record<PartInstallationState, readonly PartInstallationState[]> = {
  DRAFT: ["INSTALLED"],
  INSTALLED: ["CUSTOMER_VERIFIED", "DISPUTED", "VOIDED"],
  CUSTOMER_VERIFIED: ["VOIDED"],
  DISPUTED: ["CUSTOMER_VERIFIED", "VOIDED"],
  VOIDED: [],
};

// ── 帳票訂正リクエスト（DocumentCorrection）遷移表 ADR-0004（IMP-043） ──
export const DOCUMENT_CORRECTION_TRANSITIONS: Record<DocumentCorrectionState, readonly DocumentCorrectionState[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["APPLIED"],
  REJECTED: [],
  APPLIED: [],
};

// ── 汎用遷移検証 ──

/**
 * 指定の遷移表で from → to が有効か。
 *
 * 呼び出し例:
 *   isValidTransition(JOB_TRANSITIONS, "SCHEDULED", "CHECKED_IN") // true
 *   isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PENDING")  // false
 */
/**
 * 表に載っている状態か。**素の `table[from]` を使わない。**
 * `"toString"` や `"constructor"` は Object.prototype 経由で関数を返すので
 * `?.includes(...)` が TypeError を投げ、`"__proto__"` も同様に化ける。
 * 型は S に絞っていても、値はクライアント由来の文字列で来る（境界防御）。
 */
function known<S extends string>(table: Readonly<Record<S, readonly S[]>>, state: S): readonly S[] | null {
  return Object.hasOwn(table, state) ? table[state] : null;
}

export function isValidTransition<S extends string>(table: Readonly<Record<S, readonly S[]>>, from: S, to: S): boolean {
  return known(table, from)?.includes(to) ?? false;
}

/** 現在の状態から遷移可能な状態の一覧を返す。未知の状態は空配列。 */
export function validNextStates<S extends string>(table: Readonly<Record<S, readonly S[]>>, current: S): readonly S[] {
  return known(table, current) ?? [];
}

/**
 * 状態が終端（遷移先なし）か。
 *
 * **未知の状態は終端ではない（false）。**表に無いだけの値を「終わっている」と
 * 答えると、`reservations.status` の `completed` / `in_progress` のような
 * 稼働中の既存語彙が、正準値と暗黙に同一視されたうえ「完了済み」に化ける
 * （CLAUDE.md のドメイン状態語彙ルール）。未知かどうかは isKnownState で聞く。
 */
export function isTerminalState<S extends string>(table: Readonly<Record<S, readonly S[]>>, state: S): boolean {
  const next = known(table, state);
  return next !== null && next.length === 0;
}

/** 状態がこの遷移表に定義されているか。 */
export function isKnownState<S extends string>(table: Readonly<Record<S, readonly S[]>>, state: S): boolean {
  return known(table, state) !== null;
}

// ── 遷移拒否 ──

export type TransitionRejection = {
  from: string;
  to: string;
  axis: string;
  reason: string;
};

/**
 * 無効遷移の拒否理由を生成する。遷移が有効なら null。
 *
 * 呼び出し例:
 *   rejectTransition(JOB_TRANSITIONS, "job", "VERIFIED", "IN_PROGRESS")
 *   // → { from: "VERIFIED", to: "IN_PROGRESS", axis: "job", reason: "..." }
 */
export function rejectTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  axis: string,
  from: S,
  to: S,
): TransitionRejection | null {
  if (isValidTransition(table, from, to)) return null;

  // 未知の状態を「終端」と言わない。表に無い値について
  // 「遷移先が無い」と断定するのは、確かめていない事実の主張になる。
  if (!isKnownState(table, from)) {
    return { from, to, axis, reason: `${from} は ${axis} の状態として定義されていません。` };
  }

  const next = validNextStates(table, from);
  const reason =
    next.length === 0
      ? `${from} は終端状態です。遷移できません。`
      : `${from} から ${to} への遷移は許可されていません。有効な遷移先: ${next.join(", ")}`;

  return { from, to, axis, reason };
}
