/**
 * タブレット 2-pane レイアウト定義（IMP-034）。
 *
 * v2.0 §2: タブレット端末で一覧 + 詳細を並べて表示する 2-pane レイアウトの
 * 画面マッピング。どの正準画面が 2-pane 対応か、ペインの構成をここで定義。
 *
 * ponytail: 実際の SplitPane コンポーネントや React レイアウトは UI 層の責任。
 * ここではどの画面が 2-pane 対応か、ペインの幅比率などのデータのみ定義。
 */

import type { DeviceClass } from "./deviceClass";

// ── ペイン構成 ──

/**
 * 2-pane レイアウトの構成。
 *
 * listPane: 一覧ペイン（左側）
 * detailPane: 詳細ペイン（右側）
 * listRatio: 一覧ペインの幅比率（0-1、残りが詳細ペイン）
 */
export type TabletPaneConfig = {
  /** 画面ペア ID */
  id: string;
  /** 一覧ペインの表示名 */
  listLabel: string;
  /** 詳細ペインの表示名 */
  detailLabel: string;
  /**
   * 一覧ペインの幅比率（0-1）。
   * ponytail: タブレット横持ちで 0.35-0.4 が一般的。
   * 縦持ちではスタック表示（mobile と同じ）にフォールバック。
   */
  listRatio: number;
  /** 一覧側の Web ルート */
  listHref: string;
  /** 詳細側の Web ルートパターン（[id] はプレースホルダ） */
  detailHrefPattern: string;
};

// ── 2-pane 対応画面マッピング ──

/**
 * 2-pane 対応する画面ペアの正準リスト。
 *
 * ponytail: v2.0 §2 のタブレットレイアウト対象画面。
 * 将来の画面追加時はここに 1 行追加。
 */
export const TABLET_PANE_SCREENS: readonly TabletPaneConfig[] = [
  {
    id: "work",
    listLabel: "作業一覧",
    detailLabel: "作業詳細",
    listRatio: 0.38,
    listHref: "/admin/reservations",
    detailHrefPattern: "/admin/reservations/[id]",
  },
  {
    id: "vehicles",
    listLabel: "車両一覧",
    detailLabel: "車両詳細",
    listRatio: 0.35,
    listHref: "/admin/vehicles",
    detailHrefPattern: "/admin/vehicles/[id]",
  },
  {
    id: "certificates",
    listLabel: "証明書一覧",
    detailLabel: "証明書詳細",
    listRatio: 0.35,
    listHref: "/admin/certificates",
    detailHrefPattern: "/admin/certificates/[id]",
  },
  {
    id: "customers",
    listLabel: "顧客一覧",
    detailLabel: "顧客詳細",
    listRatio: 0.35,
    listHref: "/admin/customers",
    detailHrefPattern: "/admin/customers/[id]",
  },
] as const;

// ── レイアウト解決 ──

/**
 * レイアウトモード。
 * - single: 全幅 1 ペイン（mobile / desktop sidebar 付き）
 * - split: 2-pane 分割（tablet 横持ち）
 */
export type LayoutMode = "single" | "split";

/**
 * デバイスクラスと現在のパスからレイアウトモードを決定する。
 *
 * - desktop → single（サイドバーが常時表示されるため 2-pane 不要）
 * - tablet → 2-pane 対応画面なら split、それ以外は single
 * - mobile → single
 *
 * ponytail: desktop で 3-column（sidebar + list + detail）にする案もあるが、
 * 既存の sidebar レイアウトを壊さないため現状は single。
 * 将来対応時にここの条件を変えるだけで済む。
 */
export function resolveLayoutMode(deviceClass: DeviceClass, pathname: string): LayoutMode {
  if (deviceClass !== "tablet") return "single";
  return findPaneConfig(pathname) ? "split" : "single";
}

/**
 * パスに対応する TabletPaneConfig を返す。
 * 一覧パスまたは詳細パスのどちらにもマッチする。
 */
export function findPaneConfig(pathname: string): TabletPaneConfig | null {
  for (const config of TABLET_PANE_SCREENS) {
    if (pathname === config.listHref || pathname.startsWith(config.listHref + "/")) {
      return config;
    }
  }
  return null;
}
