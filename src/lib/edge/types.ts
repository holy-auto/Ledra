/**
 * Edge AI / DePIN 型定義
 *
 * エッジデバイス（スマートグラス、工場カメラ）からの
 * リアルタイムワークイベントの受信・処理・ブロックチェーン記録。
 *
 * DePIN (Decentralized Physical Infrastructure Network) ロードマップ:
 *   Phase 1 (現在): デバイス登録 + イベント収集 + 自動アンカー
 *   Phase 2 (予定): デバイストークンインセンティブ + ガバナンス投票
 *   Phase 3 (予定): メッシュネットワーク + オフライン耐性
 */

/** エッジデバイスの種類 */
export type EdgeDeviceKind =
  | "smart_glasses" // スマートグラス（整備士装着型）
  | "ip_camera" // 工場 IP カメラ
  | "obd_dongle" // 車載 OBD ドングル
  | "torque_wrench" // スマートトルクレンチ
  | "thickness_gauge" // 膜厚計
  | "barcode_scanner" // バーコード/QR スキャナー
  | "mobile_device"; // スマートフォン（汎用）

/** デバイス接続状態 */
export type EdgeDeviceStatus = "active" | "inactive" | "revoked";

/** エッジデバイス */
export interface EdgeDevice {
  id: string;
  tenantId: string;
  kind: EdgeDeviceKind;
  displayName: string;
  status: EdgeDeviceStatus;
  /** デバイス認証用 HMAC シークレット（DB には保存しない - ハッシュのみ） */
  deviceKeyHash: string;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  registeredAt: string;
  metadata: Record<string, unknown>;
}

/** ワークイベントの種類 */
export type EdgeEventKind =
  | "work_started" // 作業開始（AI が検知）
  | "part_scanned" // 部品バーコード/QR スキャン
  | "measurement_taken" // 計測値取得（トルク、膜厚等）
  | "work_step_completed" // 作業ステップ完了（AI 判定）
  | "work_completed" // 作業完了
  | "quality_check" // AI 品質チェック結果
  | "anomaly_detected" // 異常検知
  | "photo_captured"; // 写真撮影（スマートグラス）

/** エッジデバイスからのイベントペイロード */
export interface EdgeEventPayload {
  /** イベント種別 */
  kind: EdgeEventKind;
  /** ジョブオーダー ID（紐付け） */
  jobOrderId?: string | null;
  /** 車両 ID */
  vehicleId?: string | null;
  /** スキャンされた部品バーコード/QR 値 */
  scannedCode?: string | null;
  /** 計測値 */
  measurement?: {
    type: "torque_nm" | "thickness_um" | "temperature_c" | "custom";
    value: number;
    unit: string;
    targetMin?: number | null;
    targetMax?: number | null;
  } | null;
  /** AI 品質チェック結果 */
  qualityCheck?: {
    passed: boolean;
    score: number;
    issues: string[];
  } | null;
  /** 写真 SHA-256（スマートグラス撮影） */
  photoSha256?: string | null;
  /** デバイス側 GPS 座標（任意） */
  location?: { lat: number; lng: number } | null;
  /** 追加メタデータ（デバイス固有） */
  meta?: Record<string, unknown>;
}

/** 受信・保存済みエッジイベント */
export interface EdgeEvent {
  id: string;
  tenantId: string;
  deviceId: string;
  kind: EdgeEventKind;
  payload: EdgeEventPayload;
  /** イベントのコンテンツハッシュ（改ざん検知） */
  contentHash: string;
  /** Polygon トランザクションハッシュ */
  polygonTxHash: string | null;
  polygonAnchoredAt: string | null;
  receivedAt: string;
}

/** デバイス登録リクエスト（API 入力） */
export interface RegisterDeviceInput {
  kind: EdgeDeviceKind;
  displayName: string;
  firmwareVersion?: string;
  metadata?: Record<string, unknown>;
}

/** イベント送信リクエスト（デバイス → API） */
export interface IngestEventRequest {
  deviceId: string;
  /** デバイスイベント ID（冪等性用） */
  eventId: string;
  /** デバイス側タイムスタンプ（ISO8601） */
  deviceTimestamp: string;
  payload: EdgeEventPayload;
  /** HMAC-SHA256(deviceSecret, eventId + ":" + deviceTimestamp + ":" + JSON(payload)) */
  signature: string;
}
