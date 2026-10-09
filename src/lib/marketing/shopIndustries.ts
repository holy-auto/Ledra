/**
 * 業態別の入口ページ（/for-shops/[industry]）の中身。
 *
 * 「コーティング 施工証明書」「鈑金 工程管理」など業務語で検索した人の着地先。
 * 書いてよいのは製品に実在する機能だけ（2026-10-08 に admin / api / lib を業態ごとに確認）。
 * プランや設定で使える範囲が変わる機能は、本文にその条件を書く。
 */

export type ShopIndustry = {
  slug: string;
  /** パンくず・バッジに出す業態名 */
  name: string;
  /** <title>（レイアウトのテンプレートで「| Ledra」が付く） */
  title: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  pains: { title: string; desc: string }[];
  features: { title: string; description: string; href?: string }[];
  faqs: { question: string; answer: string }[];
  /** 関連する用語集の slug（src/lib/marketing/glossary.ts） */
  glossary: string[];
};

const followUpFeature = {
  title: "施工後のフォロー連絡",
  description:
    "施工後のフォロー、メンテナンスの時期、保証が終わる前のお知らせを、設定した日数・月数で自動で送ります（LINE 連携済みのお客様には LINE、それ以外はメール）。冬前・梅雨前の季節の提案はメールで送ります。",
};

export const SHOP_INDUSTRIES: ShopIndustry[] = [
  {
    slug: "coating",
    name: "コーティング施工店",
    title: "コーティング施工店向けの施工証明書・保証管理",
    description:
      "ガラス・セラミックコーティングの施工内容、使った製品、保証期間を施工証明書に。膜厚の記録、施工後のメンテナンス案内まで Ledra ひとつで。",
    heroTitle: "コーティングの仕上がりと保証を、証明書で残す。",
    heroSubtitle:
      "施工内容、使った製品、保証期間を施工証明書に。施工後のメンテナンス案内まで、ひとつの記録から回せます。",
    pains: [
      { title: "紙の保証書は失くされる", desc: "再発行の電話が鳴るたびに、記録を探して作り直している。" },
      {
        title: "どの製品を使ったか追えない",
        desc: "施工から数年後、下地とトップに何を使ったかを聞かれても答えられない。",
      },
      { title: "メンテナンスの声かけが漏れる", desc: "時期が来たお客様に連絡できず、リピートの機会を逃している。" },
    ],
    features: [
      {
        title: "使った製品まで載る施工証明書",
        description:
          "ブランドと製品名を製品ごとに証明書へ記載。下地とトップなど、複数の製品を重ねた施工もそのまま残せます。",
        href: "/features/digital-certificate",
      },
      {
        title: "有効期限と有効条件",
        description: "証明書の有効期限と、保証が有効であるための条件を証明書に記載します。",
      },
      {
        title: "膜厚の記録",
        description:
          "膜厚の測定値を施工の記録として入力できます。NexPTG の計測データを取り込み、車台番号で車両に自動で紐付けて管理画面で確認することもできます。",
        href: "/features/thickness",
      },
      followUpFeature,
      {
        title: "お客様はスマホで確認",
        description:
          "証明書は QR コードや URL で共有。顧客ポータルにログインしたお客様は、施工前後の写真をスライダーで見比べられます。予約枠を設定すれば、顧客ポータルから予約も受け付けられます。",
        href: "/features/customer-portal",
      },
    ],
    faqs: [
      {
        question: "自店のメニュー名で証明書を作れますか？",
        answer:
          "作れます。施工メニューは店舗で登録します。ガラスコーティング（1〜3 層）・ホイール・ヘッドライト・撥水ガラスなどのひな形から始めることもできます。",
      },
      {
        question: "メーカー認定施工店の証明書の書式は使えますか？",
        answer:
          "使えます。メーカーごとの決まった書式を Ledra 側で用意し、認定を受けた店舗に使う権限を付けます。書式は店舗側では変更できません。",
      },
      {
        question: "膜厚計が無くても使えますか？",
        answer: "使えます。膜厚の記録は任意です。証明書は施工内容・製品・写真・保証だけでも発行できます。",
      },
    ],
    glossary: ["glass-coating", "ceramic-coating", "hydrophilic-hydrophobic", "film-thickness", "coating-certificate"],
  },
  {
    slug: "ppf",
    name: "PPF施工店",
    title: "PPF施工店向けの施工証明書・施工範囲の記録",
    description:
      "PPF（ペイントプロテクションフィルム）の施工範囲をパネル単位で、フィルムの銘柄・種類とあわせて施工証明書に。保証とメンテナンス案内まで Ledra ひとつで。",
    heroTitle: "PPF の施工範囲を、パネル単位で証明する。",
    heroSubtitle:
      "どのパネルを、どのフィルムで、全面か部分か。施工内容をパネルごとに証明書へ残し、保証とメンテナンス案内につなげます。",
    pains: [
      { title: "施工範囲が写真と口頭頼み", desc: "どこまで貼ったかを後から説明しづらく、保証の話で食い違う。" },
      {
        title: "どのフィルムを貼ったか説明しづらい",
        desc: "数年後に相談が来たとき、銘柄や種類を記録から探すのに時間がかかる。",
      },
      { title: "高額施工のあとが続かない", desc: "施工後のメンテナンスや追加施工の提案につなげられていない。" },
    ],
    features: [
      {
        title: "パネル単位の施工範囲",
        description:
          "ボンネット・ドアエッジ・ヘッドライトなど 19 のパネルから選び、全面か部分かを記録（部分施工は範囲のメモも）。フロントセットやフルボディは一括で選べます。",
        href: "/features/digital-certificate",
      },
      {
        title: "フィルムの銘柄と種類",
        description: "フィルムのブランド・製品名と、グロス・マット・サテン・カラーなどの種類を証明書に記載します。",
      },
      {
        title: "保証期間と、保証の対象外",
        description:
          "保証の終了日・有効条件・保証の対象外を証明書の PDF に記載。対象外の文面は店舗の既定文として使い回せます。",
      },
      {
        title: "施工前後の写真",
        description:
          "作業前と作業後の写真を組にして登録すると、顧客ポータルにログインしたお客様が証明書のページでスライダーで見比べられます。",
        href: "/features/customer-portal",
      },
      followUpFeature,
      {
        title: "膜厚の記録",
        description: "膜厚の測定値を施工の記録として入力できます。NexPTG の計測データの取り込みにも対応しています。",
        href: "/features/thickness",
      },
    ],
    faqs: [
      {
        question: "部分施工にも使えますか？",
        answer: "使えます。パネルごとに全面か部分かを選び、部分施工には範囲のメモを付けられます。",
      },
      {
        question: "メニューや料金表はどう作りますか？",
        answer:
          "フロント部分（バンパー＋ボンネット）・フルボディのひな形から始めて、店舗の料金に合わせて編集できます。",
      },
      {
        question: "フィルムメーカーへの保証登録もできますか？",
        answer:
          "Ledra からメーカーへの保証登録はできません。証明書には、店舗としての保証（終了日・有効条件・対象外）を記載します。",
      },
    ],
    glossary: ["ppf", "film-thickness", "coating-certificate"],
  },
  {
    slug: "bodywork",
    name: "鈑金塗装店",
    title: "鈑金塗装店向けの工程管理・保険会社とのやりとり",
    description:
      "受付・協定・鈑金・塗装・完成・出庫の工程を一枚のボードで管理。保険会社とのやりとり、代車、お客様への進捗共有と同意、修理内容の証明書まで Ledra ひとつで。",
    heroTitle: "鈑金の工程と保険のやりとりを、一枚のボードで。",
    heroSubtitle:
      "受付から出庫まで、工程・納期・代車・保険会社とのやりとり・お客様への進捗共有をまとめて管理し、仕上がりは修理の証明書に残します。",
    pains: [
      { title: "どの車がどの工程か、ホワイトボード頼み", desc: "納期が近い車、止まっている車が一目で分からない。" },
      { title: "保険会社との連絡が散らばる", desc: "電話・FAX・メールに分かれて、査定の状況を追いきれない。" },
      { title: "「いつ終わる？」の電話", desc: "作業の手を止めて、お客様に進み具合を説明している。" },
    ],
    features: [
      {
        title: "工程ボード",
        description:
          "受付・協定・鈑金・塗装・完成・出庫の 6 工程をカンバンで管理。見積金額・納期（遅れを表示）・保険会社・受付番号を案件ごとに持ちます。",
      },
      {
        title: "保険会社とのやりとり",
        description:
          "査定の状況（提出済・承認・一部承認・差戻）を案件ごとに記録。保険会社が Ledra を使っていれば、案件ごとにメッセージでやりとりできます。",
        href: "/features/insurer-portal",
      },
      {
        title: "お客様への進捗共有と同意",
        description:
          "進捗ページのリンクを送ると、お客様がスマホで工程を確認できます。作業前・変更時の同意もリンクで受け取れます。工程が進んだら LINE で知らせることもできます。",
      },
      {
        title: "代車の貸出",
        description: "案件から代車の貸出・返却を記録。返却が遅れている代車は赤で表示されます。",
      },
      {
        title: "修理内容の証明書",
        description: "修理箇所・修理方法（板金修正・パネル交換・PDR など）・色番号・塗装保証を証明書に記載します。",
        href: "/features/digital-certificate",
      },
      {
        title: "工数と見積・請求",
        description:
          "型式×品番の工数を CSV で登録して工賃を計算。見積書から請求書・領収書まで発行できます。車両から AI で見積の下書きを作る機能は有料プランで使えます。",
      },
    ],
    faqs: [
      {
        question: "保険会社も Ledra を使う必要がありますか？",
        answer:
          "必要ありません。査定の状況は店舗側で記録できます。保険会社が Ledra の保険会社向け画面を使う場合は、案件ごとにメッセージでやりとりできます。",
      },
      {
        question: "今使っている見積システムと連携できますか？",
        answer: "現時点で、鈑金の見積システムとの連携はありません。工数は CSV で取り込めます。",
      },
      {
        question: "写真は作業の前後で分けられますか？",
        answer:
          "作業前と作業後の写真を組にして登録すると、顧客ポータルにログインしたお客様が証明書のページでスライダーで見比べられます。",
      },
    ],
    glossary: [
      "bodywork",
      "repaint",
      "bodywork-job-management",
      "insurance-claim-coordination",
      "adjuster",
      "repair-history",
    ],
  },
  {
    slug: "maintenance",
    name: "整備・車検工場",
    title: "整備・車検工場向けの点検記録・指定整備記録簿・証明書の電子交付",
    description:
      "点検チェックリスト、完成検査と指定整備記録簿の PDF、整備の証明書の電子交付（同意の記録つき）、車検証の読み取り、部品の交換時期のお知らせ。整備工場の記録と連絡を Ledra ひとつで。",
    heroTitle: "点検の記録から、記録簿の作成・証明書の電子交付まで。",
    heroSubtitle:
      "点検チェックリスト、完成検査と指定整備記録簿、整備の証明書の電子交付、部品の交換時期のお知らせ。整備工場の記録とお客様への連絡をまとめて扱えます。",
    pains: [
      { title: "記録簿が紙で積み上がる", desc: "保管場所を取り、過去の記録を探すのに時間がかかる。" },
      { title: "交換時期の声かけが漏れる", desc: "オイルやタイヤの交換時期の案内が、担当者の記憶頼みになっている。" },
      { title: "車検証の手入力", desc: "車台番号や型式を打ち込むたびに、入力ミスの心配がある。" },
    ],
    features: [
      {
        title: "点検チェックリスト",
        description: "入庫点検・納車前点検・定期点検・完成検査のひな形を作り、作業の中で ○×△ や数値で記録します。",
      },
      {
        title: "指定整備記録簿の PDF",
        description:
          "完成検査の結果を指定整備記録簿（第三号様式・第四号様式）の項目に沿って記録し、PDF で出力。測定値は CSV で取り込めます。事業場の指定番号・所在地は、現在は PDF に入りません。",
      },
      {
        title: "整備の証明書の電子交付",
        description:
          "お客様の同意を記録したうえで、整備の証明書（PDF）を電子で渡し、受け取りの署名をもらえます。お客様は顧客ポータルから同意を取り消すこともできます。指定整備記録簿の PDF は電子交付の対象外です。",
        href: "/glossary/maintenance-record-digitization",
      },
      {
        title: "車検証の読み取り",
        description:
          "車検証を撮影した画像から、車名・型式・年式・ナンバー・車台番号・車検満了日を読み取って登録します。",
        href: "/features/vehicle-ocr",
      },
      {
        title: "部品の交換時期のお知らせ",
        description:
          "部品の次回交換時期（日付・走行距離）を記録し、時期が来たらお客様にお知らせします（LINE 連携済みのお客様には LINE、それ以外はメール）。",
      },
      {
        title: "部品の在庫とメカニックの予定",
        description:
          "部品の入出庫・在庫が減ったときの通知・棚卸・発注を管理。メカニックごとの作業予定を時間割で見られます。",
        href: "/features/inventory",
      },
    ],
    faqs: [
      {
        question: "車検の申請（OSS）や法定費用の計算はできますか？",
        answer: "できません。Ledra が扱うのは、点検・整備の記録とお客様への連絡です。",
      },
      {
        question: "証明書を電子で渡すのに、お客様の同意は記録できますか？",
        answer:
          "できます。お客様ごとに同意を記録し、同意を取り消したお客様には電子交付しません。同意が無いと電子交付できないようにする設定もあります。",
      },
      {
        question: "分解整備（特定整備）の記録簿も出せますか？",
        answer:
          "様式に沿って PDF にできるのは、完成検査の指定整備記録簿です。分解整備の内容は、整備の証明書（作業内容・交換部品・次回の目安）として残せます。",
      },
    ],
    glossary: [
      "maintenance-record",
      "maintenance-record-digitization",
      "garage-management-system",
      "garage-dx",
      "vin",
      "work-order",
    ],
  },
];

export function getShopIndustry(slug: string): ShopIndustry | undefined {
  return SHOP_INDUSTRIES.find((i) => i.slug === slug);
}
