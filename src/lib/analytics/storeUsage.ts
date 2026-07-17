/**
 * Store usage analytics — プラットフォーム運営 (Ledra 運営) 向けの店舗別利用状況集計。
 *
 * 運営が「どの店舗が」「どの機能を」「どれだけ」使っているかを横断的に確認するための集計。
 *
 * 提供する指標:
 *  - 店舗別 月間 操作回数 / 予約作成 / 請求作成 / アクティブ会員 / 最終ログイン
 *  - プラットフォーム全体の累計件数 (予約・作業記録・請求)
 *  - 機能別の利用率 (= その機能を当月に使った店舗の割合 / 全店舗)
 *
 * 集計本体 (buildStoreUsage) は DB 非依存の純関数にしてある (route が行を取得して渡す)。
 * これによりユニットテストが可能。
 *
 * ponytail: 店舗別の「ログイン回数」は導出できない — ログインイベントを記録するテーブルが
 * 存在しないため。代替として auth.users.last_sign_in_at を用い「当月に最終ログインした会員数」を
 * アクティブ会員として近似する (当月は正確だが、last_sign_in_at は最新ログインのみ保持するため
 * 過去月は過小カウントになる)。将来の精緻化: login_events テーブルを追加してログイン回数を実測する。
 */

export type TenantMeta = {
  id: string;
  name: string | null;
  plan_tier: string | null;
  is_active: boolean | null;
};

export type IdRow = { tenant_id: string | null };

export type StoreUsageRow = {
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string;
  is_active: boolean;
  /** 当月の操作回数 (vehicle_histories = 操作/作業履歴)。 */
  operations: number;
  /** 当月に作成された予約件数。 */
  reservations: number;
  /** 当月に作成された請求書件数。 */
  invoices: number;
  /** 当月に最終ログインした会員数 (ログイン回数ではない、近似)。 */
  active_members: number;
  /** 所属会員の最終ログイン日時のうち最新のもの (全期間、ISO)。 */
  last_login_at: string | null;
};

export type FeatureAdoption = {
  key: string;
  label: string;
  /** 当月にこの機能を 1 回以上使った店舗数。 */
  tenants_using: number;
  /** tenants_using / アクティブ店舗数。分母 0 のとき null。 */
  adoption_rate: number | null;
};

export type StoreUsageResult = {
  /** 対象月 (YYYY-MM)。 */
  month: string;
  month_start: string;
  month_end: string;
  store_count: number;
  active_store_count: number;
  /** プラットフォーム全体の累計件数 (全期間・全店舗)。 */
  cumulative: { reservations: number; work_records: number; invoices: number };
  stores: StoreUsageRow[];
  feature_adoption: FeatureAdoption[];
};

/** 機能別利用率で対象にする機能 (key は集計入力の row 群に対応)。 */
export const STORE_USAGE_FEATURES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "reservations", label: "予約管理" },
  { key: "work_records", label: "作業記録" },
  { key: "invoices", label: "請求書" },
  { key: "certificates", label: "証明書" },
  { key: "customers", label: "顧客管理" },
  { key: "payments", label: "決済・POS" },
];

function countByTenant(rows: IdRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.tenant_id) continue;
    m.set(r.tenant_id, (m.get(r.tenant_id) ?? 0) + 1);
  }
  return m;
}

/**
 * 店舗別利用状況を集計する純関数。
 *
 * 呼び出し側 (route) は platform admin 認証を済ませ、必要な行を取得して渡すこと。
 */
export function buildStoreUsage(input: {
  month: string;
  monthStart: string;
  monthEnd: string;
  tenants: TenantMeta[];
  memberships: { tenant_id: string; user_id: string }[];
  /** user_id → last_sign_in_at (ISO or null)。 */
  lastSignInByUser: Map<string, string | null>;
  operationsRows: IdRow[];
  reservationRows: IdRow[];
  invoiceRows: IdRow[];
  certificateRows: IdRow[];
  customerRows: IdRow[];
  paymentRows: IdRow[];
  cumulative: { reservations: number; work_records: number; invoices: number };
}): StoreUsageResult {
  const monthStartMs = Date.parse(input.monthStart);
  const monthEndMs = Date.parse(input.monthEnd);

  const opsByTenant = countByTenant(input.operationsRows);
  const resByTenant = countByTenant(input.reservationRows);
  const invByTenant = countByTenant(input.invoiceRows);

  // アクティブ会員 (当月に最終ログイン) と 店舗別最終ログイン (全期間) を会員から集計。
  const activeByTenant = new Map<string, number>();
  const lastLoginByTenant = new Map<string, string | null>();
  for (const m of input.memberships) {
    if (!lastLoginByTenant.has(m.tenant_id)) lastLoginByTenant.set(m.tenant_id, null);
    const li = input.lastSignInByUser.get(m.user_id) ?? null;
    if (!li) continue;
    const ms = Date.parse(li);
    if (Number.isNaN(ms)) continue;
    if (ms >= monthStartMs && ms < monthEndMs) {
      activeByTenant.set(m.tenant_id, (activeByTenant.get(m.tenant_id) ?? 0) + 1);
    }
    const prev = lastLoginByTenant.get(m.tenant_id) ?? null;
    if (!prev || ms > Date.parse(prev)) lastLoginByTenant.set(m.tenant_id, li);
  }

  const stores: StoreUsageRow[] = input.tenants.map((t) => ({
    tenant_id: t.id,
    tenant_name: t.name,
    plan_tier: t.plan_tier ?? "free",
    is_active: t.is_active ?? false,
    operations: opsByTenant.get(t.id) ?? 0,
    reservations: resByTenant.get(t.id) ?? 0,
    invoices: invByTenant.get(t.id) ?? 0,
    active_members: activeByTenant.get(t.id) ?? 0,
    last_login_at: lastLoginByTenant.get(t.id) ?? null,
  }));

  // 操作回数の多い順を headline に。
  stores.sort((a, b) => b.operations - a.operations || b.reservations - a.reservations);

  const activeTenantIds = new Set(input.tenants.filter((t) => t.is_active ?? false).map((t) => t.id));
  const activeStoreCount = activeTenantIds.size;
  // 利用率の分母はアクティブ店舗数。0 のときは全店舗数にフォールバック。
  const allTenantIds = new Set(input.tenants.map((t) => t.id));
  const denomIds = activeStoreCount > 0 ? activeTenantIds : allTenantIds;
  const denom = denomIds.size;

  // 利用率の分子は分母と同じ母集団 (アクティブ店舗) に限定する。
  // 期中に非アクティブ化した店舗や、tenants に無い tenant_id の行を数えると
  // 利用率が 100% を超えてしまうため、母集団内の店舗だけを数える。
  const usingWithin = (rows: IdRow[]): number => {
    const s = new Set<string>();
    for (const r of rows) if (r.tenant_id && denomIds.has(r.tenant_id)) s.add(r.tenant_id);
    return s.size;
  };

  const featureRows: Record<string, IdRow[]> = {
    reservations: input.reservationRows,
    work_records: input.operationsRows,
    invoices: input.invoiceRows,
    certificates: input.certificateRows,
    customers: input.customerRows,
    payments: input.paymentRows,
  };

  const feature_adoption: FeatureAdoption[] = STORE_USAGE_FEATURES.map((f) => {
    const using = usingWithin(featureRows[f.key] ?? []);
    return {
      key: f.key,
      label: f.label,
      tenants_using: using,
      adoption_rate: denom > 0 ? using / denom : null,
    };
  }).sort((a, b) => b.tenants_using - a.tenants_using);

  return {
    month: input.month,
    month_start: input.monthStart,
    month_end: input.monthEnd,
    store_count: input.tenants.length,
    active_store_count: activeStoreCount,
    cumulative: input.cumulative,
    stores,
    feature_adoption,
  };
}

/** YYYY-MM を JST の月境界 [start, end) の UTC ISO 文字列に変換。不正な入力は null。 */
export function monthRangeJst(month: string): { monthStart: string; monthEnd: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  // JST(UTC+9) の月初 00:00 は UTC では 9 時間前。Date.UTC の hour に -9 を渡して正規化。
  const startUtc = Date.UTC(year, mon - 1, 1, -9, 0, 0);
  const endUtc = Date.UTC(year, mon, 1, -9, 0, 0);
  return {
    monthStart: new Date(startUtc).toISOString(),
    monthEnd: new Date(endUtc).toISOString(),
  };
}

/** 現在の JST 月 (YYYY-MM)。 */
export function currentMonthJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3_600_000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}
