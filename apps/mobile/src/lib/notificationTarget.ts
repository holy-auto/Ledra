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
  ["/admin/messages", "/messages"],
  ["/admin/documents", "/documents"],
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
  "/settings",
  "/dashboard",
  "/messages",
  "/documents",
] as const;

/**
 * 配下の画面はあるが、素のパスには画面が無いもの（index.tsx が無い）。
 * "/nfc" だけで飛ばすと未一致ルートの白画面になるため、子セグメント必須で扱う。
 */
const MOBILE_ROUTE_PREFIXES = ["/nfc", "/legal"] as const;

/**
 * 単一スラッシュ区切りの安全な文字だけで出来たパスか。
 * "//evil.com"（空セグメント＝プロトコル相対 URL）や制御文字入りを弾く。
 */
const SAFE_PATH = /^(?:\/[\w.~%-]+)+$/;

function isMobileRoute(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false;
  if (MOBILE_ROUTES.some((r) => path === r || path.startsWith(`${r}/`))) return true;
  return MOBILE_ROUTE_PREFIXES.some((r) => path.startsWith(`${r}/`));
}

/**
 * クエリの引き継ぎ。既定では落とす（モバイル側の画面が解釈しないため）が、
 * 落とすと意味が変わってしまうものだけ明示的に変換する。
 *
 * 通す条件は「モバイル側の画面がその値を実際に読む」こと。増やすときは
 * 受け側の実装を確認してから足すこと。
 */
function translateQuery(mobilePath: string, search: string): string {
  if (!search) return mobilePath;
  const params = new URLSearchParams(search);

  // /admin/messages?thread=c:xxx → /messages/c%3Axxx（会話を直接開く）
  if (mobilePath === "/messages") {
    const thread = params.get("thread");
    if (thread && /^[cle]:[\w.@-]+$/.test(thread)) {
      return `/messages/${encodeURIComponent(thread)}`;
    }
    return mobilePath;
  }

  // /admin/documents?doc_type=estimate → /documents?type=estimate
  // 発行側は ?type= に直したが、それ以前に作られた通知は ?doc_type= のまま
  // DB に残っているので両方拾う。
  if (mobilePath === "/documents") {
    const docType = params.get("doc_type") ?? params.get("type");
    if (docType === "estimate" || docType === "invoice") {
      return `/documents?type=${docType}`;
    }
    return mobilePath;
  }

  return mobilePath;
}

export function notificationTarget(linkPath: string | null): string | null {
  if (!linkPath) return null;
  const [pathPart, searchPart = ""] = linkPath.split("#")[0].split("?");
  const path = pathPart;

  for (const [web, mobile] of PATH_MAP) {
    const converted =
      path === web ? mobile : path.startsWith(`${web}/`) ? mobile + path.slice(web.length) : null;
    // 変換後もモバイルに実在する形かを確かめる（"/admin/vehicles//evil.com" 対策）
    if (converted && isMobileRoute(converted)) return translateQuery(converted, searchPart);
  }
  // すでにモバイルのパス形式で入っている場合はそのまま使う
  if (isMobileRoute(path)) return translateQuery(path, searchPart);
  return null;
}
