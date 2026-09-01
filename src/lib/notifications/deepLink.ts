/**
 * Deep link 生成（IMP-029）。
 *
 * v2.0 §13: 通知から対象エンティティへの直リンク。
 * ロールに応じた画面（admin / insurer / customer）と
 * エンティティ種別（job, certificate, customer 等）の組み合わせで
 * パスを解決する。
 *
 * 純粋関数。env 参照なし（呼び出し側が baseUrl を渡す）。
 */

// ── エンティティ種別 ──

export const DEEP_LINK_ENTITIES = [
  "job",
  "order",
  "certificate",
  "customer",
  "vehicle",
  "document",
  "invoice",
  "reservation",
  "insurer_case",
  "thickness_report",
] as const;

export type DeepLinkEntity = (typeof DEEP_LINK_ENTITIES)[number];

// ── ロール別パスプレフィクス ──

export type DeepLinkRole = "admin" | "insurer" | "customer";

// ── パス解決 ──

/**
 * エンティティ種別 × ロール → 相対パス。
 *
 * 実際のルート構造 (src/app/) に合わせてある。
 * customer ロールは tenant slug が必要なため別引数。
 *
 * ponytail: 未知のエンティティは null を返す。呼び出し側で
 * フォールバック（ダッシュボードへのリンク等）を決める。
 *
 * customer ロールは tenantSlug が必要なため buildDeepLink 側で
 * 先に分岐・return 済み。ここには admin/insurer しか来ない。
 */
function entityPath(entity: DeepLinkEntity, id: string, role: Exclude<DeepLinkRole, "customer">): string | null {
  switch (role) {
    case "admin":
      return adminPath(entity, id);
    case "insurer":
      return insurerPath(entity, id);
    default:
      return null;
  }
}

function adminPath(entity: DeepLinkEntity, id: string): string | null {
  switch (entity) {
    case "job":
      return `/admin/jobs/${id}`;
    case "order":
      return `/admin/orders/${id}`;
    case "certificate":
      // 管理画面の証明書詳細は /admin/certificates/[public_id] で、`public_id` 列で
      // 引いて見つからなければ notFound() する。他のエンティティと違い、行の `id`
      // (uuid) を渡すと必ず404になるので、呼び出し側は public_id を渡すこと。
      return `/admin/certificates/${id}`;
    case "customer":
      return `/admin/customers/${id}`;
    case "vehicle":
      return `/admin/vehicles/${id}`;
    case "document":
      return `/admin/documents/${id}`;
    case "invoice":
      return `/admin/invoices/${id}`;
    case "reservation":
      return `/admin/reservations`;
    case "insurer_case":
      return null; // admin は insurer_case を持たない
    case "thickness_report":
      return `/admin/thickness-reports/${id}`;
    default:
      return null;
  }
}

function insurerPath(entity: DeepLinkEntity, id: string): string | null {
  switch (entity) {
    case "insurer_case":
      return `/insurer/cases/${id}`;
    default:
      return null; // insurer ロールは case 以外のエンティティへの直リンクなし
  }
}

// ── 公開 API ──

export type DeepLinkParams = {
  entity: DeepLinkEntity;
  /**
   * 対象の識別子。基本は行の `id`（uuid）。
   * ただし `entity: "certificate"` だけは **`public_id`** を渡す
   * （管理画面のルートが /admin/certificates/[public_id] で public_id 引きのため）。
   */
  id: string;
  role: DeepLinkRole;
  /** customer ロールの場合のテナントスラッグ。 */
  tenantSlug?: string;
};

export type DeepLinkResult = {
  /** 相対パス。解決できない場合は null。 */
  path: string | null;
  /** baseUrl + path。path が null なら null。 */
  url: string | null;
};

/**
 * 通知のディープリンクを生成する。
 *
 * @param baseUrl - アプリの公開 URL（末尾スラッシュなし）
 * @param params - エンティティ種別・ID・ロール
 * @returns path（相対）と url（絶対）。解決不能なら両方 null。
 */
export function buildDeepLink(baseUrl: string, params: DeepLinkParams): DeepLinkResult {
  const { entity, id, role, tenantSlug } = params;

  // customer ロール: /customer/{tenantSlug} 配下
  if (role === "customer") {
    if (!tenantSlug) return { path: null, url: null };
    // customer ポータルは現在 /customer/{tenant} のみで
    // エンティティ別の子ルートは無い。ポータルトップへリンク。
    const path = `/customer/${tenantSlug}`;
    return { path, url: `${stripTrailingSlash(baseUrl)}${path}` };
  }

  const path = entityPath(entity, id, role);
  if (!path) return { path: null, url: null };
  return { path, url: `${stripTrailingSlash(baseUrl)}${path}` };
}

/**
 * 証明書の公開検証ページへのリンク。ロール不問。
 * /c/{publicId} — 既存の公開ルート。
 */
export function buildCertificatePublicLink(baseUrl: string, publicId: string): string {
  return `${stripTrailingSlash(baseUrl)}/c/${publicId}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
