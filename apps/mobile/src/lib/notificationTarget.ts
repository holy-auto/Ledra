/**
 * 通知の遷移先。
 *
 * notifications.link_path は Web 管理画面のパス（例 /admin/reservations/xxx）が入る。
 * モバイルには対応する画面が無いものもあるので、**あるものだけ**変換して返し、
 * 無ければ null を返す。null のときは行を押せる見た目にしない
 * （押しても何も起きない行は「壊れている」のと同じ）。
 */

/** Web 管理画面 → モバイルのルート対応。前方一致で置換する */
const PATH_MAP: [webPrefix: string, mobilePrefix: string][] = [
  ["/admin/reservations", "/reservations"],
  ["/admin/certificates", "/certificates"],
  ["/admin/vehicles", "/vehicles"],
  ["/admin/customers", "/customers"],
  ["/admin/notifications", "/notifications"],
];

export function notificationTarget(linkPath: string | null): string | null {
  if (!linkPath) return null;
  // クエリ・ハッシュはモバイル側の画面が解釈しないため落とす
  const path = linkPath.split(/[?#]/)[0];

  for (const [web, mobile] of PATH_MAP) {
    if (path === web) return mobile;
    if (path.startsWith(`${web}/`)) return mobile + path.slice(web.length);
  }
  // すでにモバイルのパス形式で入っている場合はそのまま使う
  if (path.startsWith("/") && !path.startsWith("/admin")) return path;
  return null;
}
