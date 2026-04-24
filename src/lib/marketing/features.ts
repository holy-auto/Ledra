/**
 * 機能グループのマスタデータ。`/features` ページと機能紹介 PDF の両方で
 * このモジュールを参照する。
 *
 * 機能追加・文言修正はここだけ編集すれば、両方に反映される。
 */

export type FeatureGroup = {
  /** `/features` ページのアンカーリンクキー */
  id: string;
  title: string;
  subtitle: string;
  features: { title: string; description: string }[];
};

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "certificate",
    title: "施工証明・記録",
    subtitle: "現場の記録を、改ざんできない証明書に変える。",
    features: [
      {
        title: "デジタル施工証明書",
        description: "写真・施工内容・施工者・日時をまとめた証明書をワンクリックで発行。QRコードで顧客に即共有。",
      },
      {
        title: "施工写真のC2PA署名",
        description: "撮影時に証明書と紐付け、C2PA規格で署名。後からの差し替え・改変を検知可能にします。",
      },
      {
        title: "Polygon anchoring",
        description:
          "証明書ハッシュをPolygonブロックチェーンに刻印。監査時に『その時点で存在した』ことを独立に検証できます。",
      },
      {
        title: "バッチPDF出力",
        description: "複数証明書の一括PDF生成。保険会社・監査機関への一括提出をシンプルに。",
      },
      {
        title: "無効化・再発行・複製",
        description: "誤発行は理由付きで無効化、同じ仕様の別車両は複製で発行。現場の業務実態に即した運用。",
      },
      {
        title: "NFC対応",
        description: "NFCタグに証明書を紐付け。スマホをかざすだけで施工証明を確認できるプレミアム体験。",
      },
    ],
  },
  {
    id: "vehicle",
    title: "車両・顧客管理",
    subtitle: "一台・一人の履歴を、時系列で全員が見られる。",
    features: [
      {
        title: "車検証OCR",
        description:
          "車検証をカメラで撮影するだけで車両情報を自動入力。Claude Vision で画像から構造化データを直接抽出。",
      },
      {
        title: "サービス履歴タイムライン",
        description:
          "証明書・予約・作業・NFC書込を一本の時系列に合成して表示。『他に何が行われたか』が1画面で分かります。",
      },
      {
        title: "顧客 360° ビュー",
        description:
          "基本情報・車両・証明書・予約案件・請求書をタブ切替で横断参照。顧客コンテキストを保持したまま次アクションへ。",
      },
      {
        title: "CSVインポート",
        description: "既存顧客データ・車両データを一括取り込み。初期導入時のデータ移行をスムーズに。",
      },
    ],
  },
  {
    id: "operations",
    title: "予約・作業・会計",
    subtitle: "受付から決済まで、現場の動きそのままに。",
    features: [
      {
        title: "予約・作業管理",
        description: "予約受付からチェックイン、作業進捗、完了までを一元管理。Googleカレンダーと双方向同期。",
      },
      {
        title: "POS会計",
        description: "施工完了後のお会計をその場で。カード決済・現金・QR決済に対応。Square連携で端末決済も。",
      },
      {
        title: "請求書・帳票",
        description: "請求書をPDFで自動生成。メール送信や共有リンクで顧客に送付。未回収アラート付き。",
      },
      {
        title: "BtoB受発注",
        description: "他の施工店と連携。得意分野を活かした仕事の受発注がプラットフォーム上で完結。",
      },
    ],
  },
  {
    id: "analytics",
    title: "経営・分析",
    subtitle: "感覚ではなく、データで判断する。",
    features: [
      {
        title: "ダッシュボード",
        description: "KPI カード、30日間発行推移、ステータス内訳チャート。運営権限では業種別・地域別の全体統計も。",
      },
      {
        title: "パートナーランク",
        description:
          "施工品質・実績に応じたプラチナ/ゴールド/シルバー/ブロンズ/スターターの5段階。保険会社・顧客への信頼指標に。",
      },
      {
        title: "売上分析・顧客分析",
        description: "売上推移・顧客単価・リピート率・キャッシュフローを可視化。データに基づく経営判断を支援。",
      },
      {
        title: "ウィジェットカスタマイズ",
        description: "ダッシュボードの表示項目・順序をユーザーごとに設定可能。役割に応じた画面を。",
      },
    ],
  },
  {
    id: "verification",
    title: "保険・代理店との連携",
    subtitle: "保険会社・代理店を、同じ事実の上に乗せる。",
    features: [
      {
        title: "保険会社ポータル",
        description: "証明書の検索・照会、案件管理、分析を一画面で。査定時に『この車に何が行われたか』を即確認。",
      },
      {
        title: "代理店ポータル",
        description: "施工店の紹介、コミッション管理、レポート。代理店のパフォーマンスを可視化。",
      },
      {
        title: "顧客ポータル",
        description: "エンドユーザーが自分の証明書をスマホで閲覧。QRコード・URLからアクセス。",
      },
      {
        title: "電子署名（自前実装）",
        description:
          "代理店契約・NDAを ECDSA P-256 ベースの自前電子署名で締結。電子署名法準拠、鍵ローテーション・監査ログ対応。",
      },
    ],
  },
  {
    id: "mobile",
    title: "モバイル・オフライン",
    subtitle: "現場のスマホで、現場の速度で。",
    features: [
      {
        title: "モバイル最適化UI",
        description: "現場スタッフ向けのタブレット・スマホ前提のUI。撮影→証明書発行の最短動線。",
      },
      {
        title: "Tap to Pay（iPhone）",
        description: "iPhone をそのままカードリーダーに。追加機材不要で現場決済が可能（Stripe連携）。",
      },
      {
        title: "PWA対応",
        description: "ブラウザから『ホームに追加』でアプリのように起動。Service Worker で通信が不安定な場所でも。",
      },
    ],
  },
  {
    id: "integration",
    title: "連携・API",
    subtitle: "既存の業務と、無理なくつなぐ。",
    features: [
      {
        title: "Stripe / Square",
        description: "Stripe サブスクリプション・請求書、Square POS端末決済。既存の決済フローに組み込めます。",
      },
      {
        title: "Google Calendar / LINE",
        description: "予約カレンダー同期、顧客LINE通知。現場で使っているツールと直接つながります。",
      },
      {
        title: "外部API",
        description: "テナントごとの外部API キー発行。自社CRM・基幹システムとの連携を実装可能。",
      },
      {
        title: "Webhook配信",
        description: "証明書発行・無効化・予約確定などをWebhookで配信。リアルタイム連携を実現。",
      },
    ],
  },
];
