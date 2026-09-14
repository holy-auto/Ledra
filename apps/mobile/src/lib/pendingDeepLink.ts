/**
 * code-review 指摘 (2026-09-09): 未認証時に受けたディープリンク（OSレベルの
 * ledra://... やユニバーサルリンク）は、認証初期化が SPLASH_FAILSAFE_MS（5秒）を
 * 超えて Stack.Protected の guard=false のまま Stack が初めてマウントされると、
 * 保護対象の画面が丸ごとナビゲータから除外され解決できず、既定ルート
 * （/ → index.tsx）へ落ちたまま二度と復元されない。
 *
 * ここでは「受け取ったパスが保護対象画面へのものか」だけを判定する純粋関数を
 * 切り出す（URL 自体のパースは expo-linking の parse()/parseInitialURLAsync() を
 * _layout.tsx 側で使う。ネイティブ依存があるためここでは扱わない）。
 */

// _layout.tsx の Stack.Protected 配下と同じトップレベルのセグメント名。
// 画面を追加/削除したらここも合わせて変えること。
export const PROTECTED_TOP_LEVEL_SEGMENTS = [
  "customers",
  "vehicles",
  "certificates",
  "nfc",
  "settings",
  "reservations",
  "work",
  "pos",
  "knowledge",
  "notifications",
  "dashboard",
] as const;

// 単一スラッシュ区切りの安全な文字だけで出来たパスか
// （notificationTarget.ts の SAFE_PATH と同じ意図。空セグメント＝プロトコル
// 相対 URL や制御文字入りを弾く）。
const SAFE_PATH = /^(?:\/[\w.~%-]+)+$/;

/**
 * expo-linking の parse().path（先頭 "/" 無し、null 許容）を受け取り、
 * 保護対象画面への再遷移に使えるパス（例 "/pos/walk-in"）を返す。
 * 保護対象外・不正な形式なら null。
 */
export function protectedDeepLinkPath(parsedPath: string | null | undefined): string | null {
  if (!parsedPath) return null;
  const path = parsedPath.startsWith("/") ? parsedPath : `/${parsedPath}`;
  if (!SAFE_PATH.test(path)) return null;
  const firstSegment = path.slice(1).split("/")[0];
  if (!(PROTECTED_TOP_LEVEL_SEGMENTS as readonly string[]).includes(firstSegment)) return null;
  return path;
}
