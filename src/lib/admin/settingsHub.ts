/**
 * 設定ハブ（歯車から開く設定・マスタの一覧）の純ロジック。
 *
 * サイドバーから外した設定系項目 (NavItem.hub === true) を、権限・本社/運営の
 * ゲートで絞り込み、見出し (hubSection) 単位に並べ替えて返す。IO も JSX も持たない
 * ので、そのまま vitest でテストできる。ゲート条件は Sidebar の filterItems と
 * 同じ意味論を保つ（設定ハブでは advanced 隠し／業種モード絞りは行わず、
 * 「権限があれば全部見える設定の総覧」として扱う）。
 */

export interface HubEntry {
  href: string;
  label: string;
  hubSection?: string;
  platformOnly?: boolean;
  orgUserVisible?: boolean;
  requiredPermission?: string;
}

export interface HubGate {
  role: string | null;
  isPlatformAdmin: boolean;
  isOrgUser: boolean;
  loading: boolean;
  can: (permission: string) => boolean;
}

/** ハブ内の見出し表示順。ここに無い見出しは末尾へ回す。 */
export const HUB_SECTION_ORDER: readonly string[] = [
  "店舗・組織",
  "業務設定",
  "マスタ・在庫",
  "連携・課金",
  "監査・その他",
  "運営",
];

/**
 * 1 項目が現在のユーザに見えるか。Sidebar.filterItems の
 * platformOnly / orgUser / requiredPermission ゲートと同じ判定。
 */
export function isHubEntryVisible(entry: HubEntry, gate: HubGate): boolean {
  // 運営 (platformOnly): 検証済みの運営管理者のみ。楽観表示しない。
  if (entry.platformOnly) return gate.isPlatformAdmin;

  // 本社専用ユーザ (tenant role 無し): 本社向け項目のみ。
  if (gate.isOrgUser && !gate.role) return entry.orgUserVisible === true;

  // 通常の権限ゲート（role 確定後のみ弾く＝ロード中は楽観表示）。
  if (entry.requiredPermission && !gate.loading && gate.role && !gate.can(entry.requiredPermission)) {
    return false;
  }
  return true;
}

/**
 * 可視な hub 項目を見出し単位にまとめ、HUB_SECTION_ORDER の順で返す。
 * excludeHref（＝ハブを描画しているページ自身）は自己参照になるため除外する。
 */
export function groupHubEntries<T extends HubEntry>(
  entries: readonly T[],
  gate: HubGate,
  excludeHref?: string,
): { section: string; items: T[] }[] {
  const bySection = new Map<string, T[]>();
  for (const entry of entries) {
    if (excludeHref && entry.href === excludeHref) continue;
    if (!isHubEntryVisible(entry, gate)) continue;
    const key = entry.hubSection ?? "その他";
    const bucket = bySection.get(key);
    if (bucket) bucket.push(entry);
    else bySection.set(key, [entry]);
  }

  const ordered: { section: string; items: T[] }[] = [];
  for (const section of HUB_SECTION_ORDER) {
    const items = bySection.get(section);
    if (items) ordered.push({ section, items });
  }
  // 順序表に無い見出しは末尾へ（登録順を保持）。
  for (const [section, items] of bySection) {
    if (!HUB_SECTION_ORDER.includes(section)) ordered.push({ section, items });
  }
  return ordered;
}
