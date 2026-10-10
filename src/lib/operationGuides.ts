/**
 * 操作ガイドの共通データソース。
 *
 * Ledra 各ポータル (admin / agent / 公開ページ) で同じ操作ガイドを再利用するため、
 * 文章と構造をここに集約しています。
 *
 * - HelpDrawer (admin 浮遊ボタン経由)
 * - /guide (公開ページ — 代理店が見込み客に共有可能)
 * - /agent/operation-guide (代理店ポータル内のヘルプセンター)
 *
 * 文言は施工店オーナー向けにわかりやすく書く。専門用語は自然に解釈できる範囲に絞る。
 */

export type GuideStep = {
  title: string;
  description: string;
};

export type Guide = {
  id: string;
  title: string;
  /** 当該操作を行う画面への内部リンク (admin) — 公開ページでは表示しない */
  href?: string;
  steps: GuideStep[];
};

export type GuideGroup = {
  id: string;
  label: string;
  /** 公開ページ・代理店ページ向けのサブ説明文 */
  intro?: string;
  guides: Guide[];
};

export const OPERATION_GUIDE_GROUPS: GuideGroup[] = [
  {
    id: "daily",
    label: "日常業務",
    intro: "毎日の店舗業務 (証明書発行・予約・顧客管理・請求) をこなすための基本操作です。",
    guides: [
      {
        id: "issue_certificate",
        title: "施工証明書を発行する",
        href: "/admin/certificates/new",
        steps: [
          {
            title: "車両を選択",
            description:
              "登録済みの車両から選択するか、その場で新規追加できます。前回の証明書から内容を引き継ぐことも可能。",
          },
          {
            title: "施工内容・写真を入力",
            description:
              "テンプレートの種別 (コーティング / PPF / 整備など) によって入力欄が変わります。Standard以上は AI 下書き・音声メモも利用可。",
          },
          {
            title: "発行ボタンを押す",
            description: "QRコードと公開URLが生成され、顧客にそのまま渡せます。発行後も無効化・複製・PDF出力が可能。",
          },
        ],
      },
      {
        id: "register_vehicle",
        title: "車両を登録する",
        href: "/admin/vehicles/new",
        steps: [
          {
            title: "車検証OCRを使う",
            description:
              "電子車検証の二次元コードをカメラで読むか画像をアップロード → メーカー・車種・年式・車体番号・ナンバー・サイズが自動入力されます。",
          },
          {
            title: "顧客を紐付け",
            description:
              "既存顧客から検索するか、その場で新規顧客を作成できます。後から /admin/vehicles/[id] で変更可能。",
          },
          {
            title: "登録 → 証明書発行へ",
            description: "車両詳細から「証明書発行」ボタンで車両IDを引き継いだまま発行画面に進めます。",
          },
        ],
      },
      {
        id: "register_customer",
        title: "顧客を登録する",
        href: "/admin/customers",
        steps: [
          { title: "「新規追加」をクリック", description: "顧客一覧の右上にあるボタンから登録フォームを開きます。" },
          {
            title: "氏名・連絡先を入力",
            description: "氏名は必須、メール・電話・住所は任意。後から顧客詳細でいつでも編集できます。",
          },
          {
            title: "車両・証明書を紐付け",
            description:
              "顧客詳細画面の各タブから「+ 車両登録」「証明書発行」「請求書作成」へ顧客IDを保ったまま進めます。",
          },
        ],
      },
      {
        id: "create_invoice",
        title: "請求書を作成する",
        href: "/admin/invoices",
        steps: [
          { title: "「新規作成」をクリック", description: "請求書管理ページの右上から入力フォームを開きます。" },
          {
            title: "顧客と品目を入力",
            description: "品目マスタから選択するか自由入力。証明書から金額を引き継ぐこともできます。",
          },
          {
            title: "発行 → 顧客に送付",
            description: "PDFダウンロードや共有リンク発行が可能。Stripe Connect 連携済みなら決済リンクも作成できます。",
          },
        ],
      },
      {
        id: "create_reservation",
        title: "予約を登録する",
        href: "/admin/reservations",
        steps: [
          { title: "「+ 新規予約」をクリック", description: "予約管理ページの右上から入力フォームを開きます。" },
          {
            title: "日時・顧客・車両を設定",
            description: "施工メニューや作業時間を入力。Googleカレンダーと連携すれば自動的に同期されます。",
          },
          {
            title: "案件ワークフローへ",
            description:
              "予約詳細から「案件ワークフローを開く」を押すと、チェックイン → 作業 → 完了 → 請求 まで案内に沿って進められます。",
          },
        ],
      },
      {
        id: "walkin_job",
        title: "飛び込み案件を開始する",
        href: "/admin/jobs/new",
        steps: [
          {
            title: "タイトルを入力 (任意)",
            description: "デフォルトで「飛び込み案件 YYYY-MM-DD」が入っています。そのままでもOK。",
          },
          {
            title: "開始ステータスを選ぶ",
            description: "「来店・受付」または「作業中」を選択。あとから変更できます。",
          },
          {
            title: "顧客・車両は後付けOK",
            description: "案件作成後の画面で既存顧客の検索・新規作成・車両登録ができます。",
          },
        ],
      },
      {
        id: "job_workflow",
        title: "案件ワークフローで業務を進める",
        steps: [
          {
            title: "予約 / 案件詳細を開く",
            description: "予約一覧から「案件ワークフローを開く」ボタン、または /admin/jobs/[id] へ移動します。",
          },
          {
            title: "ステッパーで進捗を更新",
            description: "「予約確定 → 来店 → 作業中 → 完了」を1クリックで進められます。",
          },
          {
            title: "次アクションから1クリック起動",
            description:
              "ステータスに応じて証明書発行・請求書作成のボタンが表示。車両ID・顧客IDが自動引き継ぎされます。",
          },
        ],
      },
      {
        id: "pos_register",
        title: "POSレジで会計する",
        href: "/admin/pos",
        steps: [
          {
            title: "レジを開局",
            description: "営業開始時に開局し、開始時の現金残高を入力。閉局時に売上突合が出来ます。",
          },
          {
            title: "予約 or ウォークインで会計",
            description: "予約一覧から会計対象を選択、もしくは「ウォークイン会計」でその場入力。",
          },
          {
            title: "決済方法を選んで完了",
            description: "現金 / Stripe Terminal / QR / 銀行振込から選択。完了で領収書送信もできます。",
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "店舗・チーム設定",
    intro:
      "Ledra を導入したらまず整えておきたい初期設定です。証明書 PDF・請求書 PDF の見映えと信頼感を大きく上げます。",
    guides: [
      {
        id: "shop_info",
        title: "店舗情報を設定する",
        href: "/admin/settings",
        steps: [
          {
            title: "メール・電話・住所を入力",
            description: "証明書PDFや請求書に自動表示されます。連絡先が空欄だと信頼感が下がるので入力推奨。",
          },
          {
            title: "Webサイト URL",
            description: "顧客向けの公開証明書ページに「店舗サイトを見る」リンクとして掲載されます。",
          },
          {
            title: "適格請求書登録番号 (T+13桁)",
            description: "インボイス制度対応の請求書を発行するために必要。未登録の場合は空欄で OK。",
          },
        ],
      },
      {
        id: "logo",
        title: "ロゴをアップロードする",
        href: "/admin/logo",
        steps: [
          {
            title: "推奨サイズ",
            description: "1:1 (正方形) または 横長 4:1 程度を推奨。背景透過 PNG が綺麗に出ます。",
          },
          {
            title: "ファイルを選択",
            description: "ドラッグ&ドロップ、もしくは「ファイルを選択」から PNG/JPG をアップロード。",
          },
          {
            title: "証明書PDFに自動反映",
            description: "アップロード後に発行する証明書から右上にロゴが入ります。既存証明書は再生成で反映可能。",
          },
        ],
      },
      {
        id: "bank_invoice",
        title: "振込先・インボイス番号を設定する",
        href: "/admin/settings",
        steps: [
          {
            title: "店舗設定 → 口座情報",
            description: "銀行名・支店・口座種別・口座番号・口座名義を入力。請求書PDFの振込先欄に自動印字されます。",
          },
          {
            title: "店舗設定 → インボイス設定",
            description: "適格請求書発行事業者の T+13桁の登録番号を入力。発行する請求書に自動表示されます。",
          },
        ],
      },
      {
        id: "stripe_connect",
        title: "Stripe Connect を連携する",
        href: "/admin/settings",
        steps: [
          {
            title: "店舗設定 → Stripe Connect",
            description: "「連携を開始」を押すと Stripe の本人確認手続き画面に遷移します。",
          },
          {
            title: "本人確認を完了",
            description: "Stripe 側のフォームに事業者情報を入力。完了すると Ledra に戻り「連携済み」と表示されます。",
          },
          {
            title: "請求書から決済リンクを送る",
            description:
              "請求書詳細から「決済リンクを作成」で顧客にカード決済リンクを送れます。入金は自動的に Ledra にも反映されます。",
          },
        ],
      },
      {
        id: "invite_member",
        title: "スタッフを招待する",
        href: "/admin/members",
        steps: [
          {
            title: "メールアドレスと表示名を入力",
            description: "招待先のメールアドレスと表示名を入れます。違うドメインでも招待OK。",
          },
          {
            title: "ロールを選択",
            description: "管理者は全機能、スタッフは日常業務 (証明書・予約・顧客) のみ。後から変更可能。",
          },
          {
            title: "招待先がパスワードを設定",
            description: "招待されたユーザーは案内に従ってサインアップしログインできます。",
          },
        ],
      },
      {
        id: "menu_items_master",
        title: "品目マスタを登録する",
        href: "/admin/menu-items",
        steps: [
          {
            title: "新規登録 or CSVインポート",
            description: "施工メニュー名・単価・税率区分を入力。CSV見本もダウンロード可能。",
          },
          {
            title: "請求書作成で呼び出し",
            description: "請求書フォームの品目欄から登録済みメニューをワンクリックで追加できます。",
          },
          {
            title: "値上げ・廃止の管理",
            description: "編集で価格変更、無効化で履歴を残しつつ非表示に。新旧の請求書整合性を保てます。",
          },
        ],
      },
      {
        id: "coating_brands_master",
        title: "コーティング剤マスターを登録する",
        href: "/admin/settings/brands",
        steps: [
          {
            title: "ブランドを追加",
            description: "CARPRO / GYEON / GLARE などの製造元・ブランド名を登録します。",
          },
          {
            title: "ブランド配下に製品を追加",
            description: "ブランドカードを展開し、製品名 (例: CQuartz UK 3.0) と製品コードを登録。",
          },
          {
            title: "証明書発行で自動表示",
            description: "コーティング・PPFテンプレートでの証明書発行時、登録済み製品が選択肢に表示されます。",
          },
        ],
      },
      {
        id: "two_factor_auth",
        title: "2要素認証 (2FA) を有効にする",
        href: "/admin/settings/security",
        steps: [
          {
            title: "認証アプリを準備",
            description: "Google Authenticator / 1Password / Authy などをスマホにインストール。",
          },
          {
            title: "QRコードを読み込み",
            description: "Ledra に表示される QR を認証アプリで読み取り、6桁コードを入力して有効化。",
          },
          {
            title: "次回ログインから利用",
            description: "メール+パスワードに加えて6桁コードが必要に。保険会社向けの信頼性が上がります。",
          },
        ],
      },
      {
        id: "billing_plan",
        title: "プランを変更・解約する",
        href: "/admin/billing",
        steps: [
          {
            title: "プラン比較表を確認",
            description: "月の発行可能数・利用可能機能・写真上限などを比較できます。",
          },
          {
            title: "「このプランに変更」",
            description: "Stripe Checkout に遷移して決済。完了で即日切り替わります。",
          },
          {
            title: "支払い方法・領収書",
            description: "Stripe カスタマーポータルから支払い方法変更・領収書ダウンロード・解約が可能。",
          },
        ],
      },
    ],
  },
  {
    id: "advanced",
    label: "便利機能",
    intro: "慣れてきた人向けの時短ワザ・横断管理機能。商談・査定対応のスピードがさらに上がります。",
    guides: [
      {
        id: "command_palette",
        title: "Cmd+K で素早く移動・検索",
        steps: [
          { title: "どの画面でも Cmd+K (Mac) / Ctrl+K (Win)", description: "コマンドパレットが開きます。" },
          {
            title: "ページ名・顧客名・証明書ID で検索",
            description: "入力するとマッチする項目がリアルタイム表示。Enter で開きます。",
          },
          { title: "矢印キーで選択、Esc で閉じる", description: "マウスを使わずに最短経路でページ移動できます。" },
        ],
      },
      {
        id: "service_timeline",
        title: "車両の施工履歴を一覧で見る",
        steps: [
          { title: "車両詳細を開く", description: "/admin/vehicles/[id] へ移動します。" },
          {
            title: "サービス履歴タイムライン",
            description: "証明書発行・予約・NFC書込み・履歴を1本の時系列で表示。色分けバッジで識別。",
          },
          {
            title: "クリックで該当画面へ",
            description: "証明書イベントは公開証明書、予約イベントは案件ワークフローへ即遷移。",
          },
        ],
      },
      {
        id: "customer_360",
        title: "顧客の360°ビューで横断管理",
        steps: [
          { title: "顧客詳細を開く", description: "/admin/customers/[id] へ移動します。" },
          {
            title: "車両・証明書・予約・請求のタブ",
            description: "1人のお客様に紐付くデータを横断表示。並列取得で高速。",
          },
          {
            title: "右上のクイックアクション",
            description:
              "「+ 車両登録」「証明書発行」「請求書作成」「飛び込み案件」を顧客コンテキストを保ったまま起動。",
          },
        ],
      },
    ],
  },
];
