/**
 * Offline outbox - 切断時に行ったアクションをブラウザ IndexedDB にキュー保存し、
 * 再接続時にサーバへフラッシュする仕組みの型定義。
 *
 * 用途は地方店舗の不安定な Wi-Fi 環境下で証明書発行などの業務を止めないこと。
 * 写真などのバイナリも将来扱えるよう、bodyJson 以外に Blob refs を持つ拡張
 * 余地を残してある (今は v1 として JSON のみ)。
 */

export type OutboxMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/** UI に表示するためのカテゴリ。アイコン分岐に使う。 */
export type OutboxKind =
  "certificate_create" | "certificate_image_upload" | "certificate_activate" | "reservation_update" | "other";

/**
 * multipart アタッチメントの定義。実際の Blob は別 store (outbox_blobs) に保存し、
 * blobRef でリンクする (キュー全体の JSON シリアライズを単純に保つため)。
 */
export interface OutboxMultipartField {
  /** form field 名 */
  name: string;
  /** 文字列値 */
  value: string;
}

export interface OutboxMultipartFile {
  /** form field 名 (例: "photos") */
  name: string;
  /** outbox_blobs.id への参照 */
  blobRef: string;
  fileName: string;
  mimeType: string;
}

export interface OutboxMultipart {
  fields: OutboxMultipartField[];
  files: OutboxMultipartFile[];
}

export interface OutboxItem {
  /** client-side uuid v4 (crypto.randomUUID()) */
  id: string;
  url: string;
  method: OutboxMethod;
  /** JSON serialized request body (null = empty body)。multipart のときは null */
  bodyJson: string | null;
  /** multipart/form-data リクエスト用ペイロード。bodyJson と排他 */
  multipart?: OutboxMultipart;
  /** 追加ヘッダ (Authorization は cookie で済むので通常は不要) */
  headers?: Record<string, string>;
  /** UI 表示用ラベル (例: "証明書発行: 田中さん プリウス") */
  label: string;
  kind: OutboxKind;
  /** unix ms (Date.now()) */
  createdAt: number;
  /** 試行回数 */
  attempts: number;
  /** 直近試行の unix ms。未試行なら null */
  lastAttemptAt: number | null;
  /** 直近エラーメッセージ。成功した場合は item ごと削除されるため null のみ */
  lastError: string | null;
  /**
   * 恒久的に送れないと判定された時刻 (unix ms)。null / undefined なら通常の再送対象。
   *
   * 400 のようにリクエスト内容そのものが原因のエラーは、何度送っても同じ結果にしかならない。
   * これを普通の失敗として扱うと `drainOutbox` が永久にリトライし続け、後続アイテムの
   * 送信機会も食い潰す。ここに時刻が入ったアイテムは drain の対象から外し、
   * UI (`PendingOfflineCerts`) が「作り直しが必要」として利用者に見せる。
   * 勝手に消さないのは、利用者が内容を確認してから取り消せるようにするため。
   */
  blockedAt?: number | null;
}

export type EnqueueInput = Pick<OutboxItem, "url" | "method" | "label" | "kind"> &
  Partial<Pick<OutboxItem, "bodyJson" | "headers" | "multipart">>;
