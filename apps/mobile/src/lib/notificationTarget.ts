/**
 * 通知の遷移先。
 *
 * notifications.link_path は Web 管理画面のパス（例 /admin/reservations/xxx）が入る。
 * モバイルには対応する画面が無いものもあるので、**あるものだけ**変換して返し、
 * 無ければ null を返す。null のときは行を押せる見た目にしない
 * （押しても何も起きない行は「壊れている」のと同じ）。
 *
 * link_path はこのリポジトリの外（配信側）が書き込む値なので信用しない。
 * 素通しで router.push すると、存在しないルート＝白画面や、"//example.com" のような
 * プロトコル相対 URL（Web ビルドで外部遷移になる）を踏む。許可した接頭辞だけ通す。
 */

/** Web 管理画面 → モバイルのルート対応。前方一致で置換する */
const PATH_MAP: [webPrefix: string, mobilePrefix: string][] = [
  ["/admin/reservations", "/reservations"],
  ["/admin/certificates", "/certificates"],
  ["/admin/vehicles", "/vehicles"],
  ["/admin/customers", "/customers"],
  ["/admin/notifications", "/notifications"],
];

/**
 * モバイルに実在するトップレベルのルート。src/app/ 直下と対応する。
 * 画面を足したらここにも足すこと（足すまで遷移しないだけで、壊れはしない）。
 */
const MOBILE_ROUTES = [
  "/reservations",
  "/certificates",
  "/vehicles",
  "/customers",
  "/notifications",
  "/knowledge",
  "/work",
  "/pos",
  "/nfc",
  "/settings",
  "/legal",
  "/dashboard",
] as const;

/**
 * 単一スラッシュ区切りの安全な文字だけで出来たパスか。
 * "//evil.com"（空セグメント＝プロトコル相対 URL）や制御文字入りを弾く。
 */
const SAFE_PATH = /^(?:\/[\w.~%-]+)+$/;

function isMobileRoute(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false;
  return MOBILE_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}

export function notificationTarget(linkPath: string | null): string | null {
  if (!linkPath) return null;
  // クエリ・ハッシュはモバイル側の画面が解釈しないため落とす
  const path = linkPath.split(/[?#]/)[0];

  for (const [web, mobile] of PATH_MAP) {
    const converted =
      path === web ? mobile : path.startsWith(`${web}/`) ? mobile + path.slice(web.length) : null;
    // 変換後もモバイルに実在する形かを確かめる（"/admin/vehicles//evil.com" 対策）
    if (converted && isMobileRoute(converted)) return converted;
  }
  // すでにモバイルのパス形式で入っている場合はそのまま使う
  if (isMobileRoute(path)) return path;
  return null;
}
