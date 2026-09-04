/**
 * IMP-053: 構造化エラー契約 — v2.0 §14.4。
 *
 * 目的:
 * - 全 API / cron / webhook エラーが「データは安全か」「復旧手段は何か」
 *   「再試行してよいか」を構造的に伝達するための型基盤
 * - 既存の apiInternalError / sendCronFailureAlert / captureSecurityEvent と
 *   組み合わせて使う（置き換えではない）
 * - Sentry breadcrumb / ダッシュボード表示 / ユーザー向けメッセージの
 *   構造化入力として消費される
 *
 * ponytail: 型とファクトリのみ。既存 response.ts の ErrorCode / apiError() は
 * 変更しない。消費側の統合は既存ルートの段階的移行で行う。
 */

// ── データ安全性 ──

/**
 * エラー発生時のデータ安全性レベル。
 *
 * - safe: データは完全に一貫した状態。ロールバック済みまたは副作用なし。
 * - partial: 一部の操作は完了し一部は未完了。手動確認が必要な場合がある。
 * - unknown: データ状態を判定できない（タイムアウト、ネットワーク切断等）。
 * - compromised: データ不整合が確認された。即時対応が必要。
 */
export type DataSafetyLevel = "safe" | "partial" | "unknown" | "compromised";

// ── 復旧アクション ──

/**
 * ユーザーまたはシステムが取るべき復旧アクション。
 */
export type RecoveryAction = {
  /** アクション種別 */
  kind:
    | "retry" // 同じ操作を再試行
    | "retry_after" // 指定時間後に再試行
    | "contact_support" // サポートに連絡
    | "manual_check" // 管理画面で手動確認
    | "refresh" // ページ/データをリロード
    | "rollback" // 手動ロールバックが必要
    | "none"; // 自動復旧済み/対応不要

  /** ユーザー向け説明（ja）。 */
  label: string;

  /** 再試行の場合の推奨待機秒数。 */
  retryAfterSeconds?: number;

  /** 手動確認先の画面パス（例: "/admin/reservations"）。 */
  targetPath?: string;
};

// ── エラーカテゴリ ──

/**
 * エラーの技術的分類。Sentry タグ・ダッシュボード集計の軸。
 *
 * ponytail: response.ts の ErrorCode（validation_error 等）はクライアント向け。
 * こちらは運用・監視向けの分類軸で、粒度が異なる。
 */
export type ErrorCategory =
  | "validation" // 入力バリデーション失敗
  | "auth" // 認証・認可
  | "data_integrity" // DB 制約違反・データ不整合
  | "external_service" // 外部 API（Stripe, Supabase, 等）の障害
  | "timeout" // タイムアウト
  | "rate_limit" // レート制限
  | "state_transition" // 不正な状態遷移（IMP-015 の遷移表違反）
  | "resource_not_found" // リソース未検出
  | "concurrency" // 楽観ロック・冪等キー衝突
  | "configuration" // 環境変数・設定不備
  | "unknown"; // 分類不能

// ── 再試行ポリシー ──

/** 再試行の可否と戦略。 */
export type RetryPolicy = {
  /** 再試行してよいか。 */
  retryable: boolean;

  /**
   * 推奨最大リトライ回数。retryable=false のときは無視。
   * ponytail: デフォルトは呼び出し側の判断。型は上限のヒントのみ提供。
   */
  maxAttempts?: number;

  /**
   * 推奨バックオフ戦略。
   * - fixed: 固定間隔
   * - exponential: 指数バックオフ
   * - none: 即時リトライ可
   */
  backoff?: "fixed" | "exponential" | "none";

  /** バックオフの基準秒数。 */
  baseDelaySeconds?: number;
};

// ── 構造化エラー契約 ──

/**
 * 構造化エラー契約。
 *
 * 全エラーが答えるべき 4 つの問い:
 * 1. データは安全か？ → dataSafety
 * 2. 何が起きたか？ → category + message + code
 * 3. 再試行してよいか？ → retry
 * 4. どう復旧するか？ → recovery
 */
export type StructuredError = {
  /** エラーの技術的分類。 */
  category: ErrorCategory;

  /** 機械的なエラーコード（既存 ErrorCode と同等だが拡張可能）。 */
  code: string;

  /** ユーザー向けメッセージ（本番用、安全）。 */
  message: string;

  /** 開発者向け詳細（本番では抑制）。 */
  detail?: string;

  /** データ安全性。 */
  dataSafety: DataSafetyLevel;

  /** 再試行ポリシー。 */
  retry: RetryPolicy;

  /** 復旧アクション（優先順）。 */
  recovery: RecoveryAction[];

  /** Sentry / ログ追加コンテキスト。 */
  context?: Record<string, unknown>;

  /** 発生源（API route / cron job / webhook handler）。 */
  source?: string;
};

// ── ファクトリ ──

/**
 * StructuredError 生成の最小入力。デフォルト値を持つフィールドは省略可。
 */
export type CreateStructuredErrorInput = {
  category: ErrorCategory;
  code: string;
  message: string;
  detail?: string;
  dataSafety?: DataSafetyLevel;
  retry?: Partial<RetryPolicy>;
  recovery?: RecoveryAction[];
  context?: Record<string, unknown>;
  source?: string;
};

/**
 * StructuredError を生成する純粋ファクトリ。
 *
 * デフォルト:
 * - dataSafety: "safe"（バリデーション等の無副作用エラー向け）
 * - retry: { retryable: false }
 * - recovery: [{ kind: "none", label: "対応不要" }]
 */
export function createStructuredError(input: CreateStructuredErrorInput): StructuredError {
  return {
    category: input.category,
    code: input.code,
    message: input.message,
    detail: input.detail,
    dataSafety: input.dataSafety ?? "safe",
    retry: {
      retryable: input.retry?.retryable ?? false,
      maxAttempts: input.retry?.maxAttempts,
      backoff: input.retry?.backoff,
      baseDelaySeconds: input.retry?.baseDelaySeconds,
    },
    // 呼び出し元が共有オブジェクト/配列を渡して後から変更しても、生成済みの
    // エラーには影響しないようコピーする（IMP-050 exportAudit.ts と同パターン）。
    recovery: input.recovery ? [...input.recovery] : [{ kind: "none", label: "対応不要" }],
    context: input.context ? { ...input.context } : undefined,
    source: input.source,
  };
}

// ── プリセット ──

/**
 * よく使うエラーパターンのプリセットファクトリ。
 * ponytail: 既存の apiValidationError / apiInternalError の拡張版。
 * 消費側は structuredErrors.validation(...) で構造化エラーを作り、
 * 既存の apiError() と併用する。
 */
export const structuredErrors = {
  /** 入力バリデーションエラー。データ安全: safe、再試行: 修正後可。 */
  validation(message: string, opts?: { code?: string; detail?: string; source?: string }): StructuredError {
    return createStructuredError({
      category: "validation",
      code: opts?.code ?? "validation_error",
      message,
      detail: opts?.detail,
      dataSafety: "safe",
      retry: { retryable: false },
      // "none" は「対応不要」の意味であり、ユーザーに修正を求めるこのケースには
      // 合わない。システムは自動再試行しない(retryable: false)が、ユーザーが
      // 入力を直して再送信するアクションはあるため "retry" とする。
      recovery: [{ kind: "retry", label: "入力内容を修正してください" }],
      source: opts?.source,
    });
  },

  /** 外部サービス障害。データ安全: unknown、再試行: 可（指数バックオフ）。 */
  externalService(
    service: string,
    message: string,
    opts?: {
      dataSafety?: DataSafetyLevel;
      /** ユーザー向け「あとN秒待ってください」表示に使う秒数。 */
      retryAfterSeconds?: number;
      /** システムの自動再試行(指数バックオフ)の基準秒数。retryAfterSeconds とは独立。 */
      baseDelaySeconds?: number;
      source?: string;
    },
  ): StructuredError {
    return createStructuredError({
      category: "external_service",
      code: `external_${service}_error`,
      message,
      dataSafety: opts?.dataSafety ?? "unknown",
      retry: {
        retryable: true,
        maxAttempts: 3,
        backoff: "exponential",
        baseDelaySeconds: opts?.baseDelaySeconds ?? 2,
      },
      recovery: [
        {
          kind: "retry_after",
          label: "しばらく待ってから再試行してください",
          retryAfterSeconds: opts?.retryAfterSeconds ?? 30,
        },
        { kind: "contact_support", label: "問題が続く場合はサポートにお問い合わせください" },
      ],
      context: { service },
      source: opts?.source,
    });
  },

  /** 状態遷移違反（IMP-015）。データ安全: safe、再試行: 不可。 */
  stateTransition(from: string, to: string, entity: string, opts?: { source?: string }): StructuredError {
    return createStructuredError({
      category: "state_transition",
      code: "invalid_state_transition",
      message: `${entity} を「${from}」から「${to}」に変更できません`,
      dataSafety: "safe",
      retry: { retryable: false },
      recovery: [{ kind: "refresh", label: "最新の状態を確認してください" }],
      context: { entity, from, to },
      source: opts?.source,
    });
  },

  /** データ不整合。データ安全: compromised/partial、要手動確認。 */
  dataIntegrity(
    message: string,
    opts?: { dataSafety?: DataSafetyLevel; targetPath?: string; source?: string },
  ): StructuredError {
    return createStructuredError({
      category: "data_integrity",
      code: "data_integrity_error",
      message,
      dataSafety: opts?.dataSafety ?? "partial",
      retry: { retryable: false },
      recovery: [
        {
          kind: "manual_check",
          label: "管理画面で該当データを確認してください",
          targetPath: opts?.targetPath,
        },
        { kind: "contact_support", label: "不整合が解消しない場合はサポートにお問い合わせください" },
      ],
      source: opts?.source,
    });
  },

  /** タイムアウト。データ安全: unknown、再試行: 可。 */
  timeout(operation: string, opts?: { retryAfterSeconds?: number; source?: string }): StructuredError {
    return createStructuredError({
      category: "timeout",
      code: "timeout",
      message: `${operation} がタイムアウトしました`,
      dataSafety: "unknown",
      retry: { retryable: true, maxAttempts: 2, backoff: "fixed", baseDelaySeconds: opts?.retryAfterSeconds ?? 5 },
      recovery: [
        { kind: "retry", label: "再試行してください" },
        { kind: "manual_check", label: "操作が完了しているか確認してください" },
      ],
      context: { operation },
      source: opts?.source,
    });
  },

  /** 楽観ロック / 冪等キー衝突。データ安全: safe、リフレッシュ後再試行。 */
  concurrency(message: string, opts?: { source?: string }): StructuredError {
    return createStructuredError({
      category: "concurrency",
      code: "concurrency_conflict",
      message,
      dataSafety: "safe",
      retry: { retryable: true, maxAttempts: 1, backoff: "none" },
      recovery: [{ kind: "refresh", label: "最新のデータを読み込んでから再試行してください" }],
      source: opts?.source,
    });
  },
} as const;

// ── ユーティリティ ──

/**
 * StructuredError の dataSafety が即時対応を要するか判定。
 * Sentry アラートレベルの決定・ダッシュボード表示に使う。
 */
export function requiresImmediateAttention(error: StructuredError): boolean {
  return error.dataSafety === "compromised" || error.dataSafety === "partial";
}

/**
 * StructuredError を Sentry breadcrumb 用の flat Record に変換。
 * ponytail: Sentry scope.setContext() に渡せる形式。
 */
export function toSentryContext(error: StructuredError): Record<string, unknown> {
  return {
    // error.context を先に展開する。固定フィールドを後に置くことで、
    // context のキーが category/source 等の名前と衝突しても固定値が優先される
    // （任意の context で監視用の固定フィールドが上書きされるのを防ぐ）。
    ...error.context,
    category: error.category,
    code: error.code,
    data_safety: error.dataSafety,
    retryable: error.retry.retryable,
    recovery_kinds: error.recovery.map((r) => r.kind).join(","),
    source: error.source,
  };
}

/**
 * StructuredError からユーザー向けレスポンスペイロードを抽出。
 * 本番では detail を除外し、recovery の label のみ含める。
 */
export function toClientPayload(
  error: StructuredError,
  opts?: { includeDetail?: boolean },
): {
  error: string;
  message: string;
  detail?: string;
  recovery: Array<{ kind: string; label: string; retryAfterSeconds?: number }>;
  retryable: boolean;
} {
  return {
    error: error.code,
    message: error.message,
    ...(opts?.includeDetail && error.detail ? { detail: error.detail } : {}),
    recovery: error.recovery.map((r) => ({
      kind: r.kind,
      label: r.label,
      ...(r.retryAfterSeconds != null ? { retryAfterSeconds: r.retryAfterSeconds } : {}),
    })),
    retryable: error.retry.retryable,
  };
}
