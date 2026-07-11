/**
 * 施工・整備・保険・デジタル証明の用語集データ。
 *
 * 柱ページ `/glossary` と個別ページ `/glossary/[slug]` の両方がここを参照する。
 * プログラマティック SEO の狙い: 「〇〇 とは」検索クエリの受け皿を用語ごとに
 * 1 URL ずつ用意し、関連用語で内部リンク網を張る。
 *
 * 編集ルール（要望⑧「嘘のないリアル」準拠）:
 * - 定義は一般に受け入れられた事実のみ。製品固有の誇張・未確認の数値は書かない。
 * - Ledra 固有機能の説明はサイト内の該当ページと矛盾させない（related で繋ぐ）。
 * - related は必ず実在する slug を指す（テストで担保）。
 */

export type GlossaryCategory = "coating" | "bodywork" | "insurance" | "tech";

export type GlossaryTerm = {
  /** URL slug（英小文字・ハイフン） */
  slug: string;
  /** 見出し語 */
  term: string;
  /** 読み（ふりがな・英語表記など） */
  reading: string;
  category: GlossaryCategory;
  /** 一覧・メタ用の 1 行要約 */
  short: string;
  /** 本文（2〜3 文）。事実ベースで簡潔に。 */
  definition: string;
  /** 関連用語の slug（内部リンク） */
  related: string[];
  /** 関連する機能ページ等への任意リンク */
  seeAlso?: { label: string; href: string };
};

export const GLOSSARY_CATEGORIES: Record<GlossaryCategory, { label: string; description: string }> = {
  coating: {
    label: "コーティング・保護フィルム",
    description: "ボディを保護・美観維持するための被膜やフィルムに関する用語。",
  },
  bodywork: {
    label: "整備・板金・仕上げ",
    description: "整備、板金塗装、磨きなど現場作業に関する用語。",
  },
  insurance: {
    label: "保険・査定・流通",
    description: "車両保険・査定・中古車流通で使われる用語。",
  },
  tech: {
    label: "デジタル証明・技術",
    description: "施工証明のデジタル化を支える技術・仕組みに関する用語。",
  },
};

export const GLOSSARY: GlossaryTerm[] = [
  // ── コーティング・保護フィルム ─────────────────────────────
  {
    slug: "glass-coating",
    term: "ガラスコーティング",
    reading: "ガラスコーティング / glass coating",
    category: "coating",
    short: "ガラス質（シリカ系）の被膜で塗装面を保護するコーティング。",
    definition:
      "ケイ素化合物（シリカ, SiO₂ 等）を主成分とする液剤を塗装面に塗布し、硬化させてガラス質の被膜を形成するコーティングです。光沢の向上と、紫外線・酸性雨・汚れからの保護を目的とします。被膜の耐久性は製品や施工環境によって幅があります。",
    related: ["ceramic-coating", "hydrophilic-hydrophobic", "film-thickness", "coating-certificate"],
    seeAlso: { label: "施工証明書の機能を見る", href: "/features/digital-certificate" },
  },
  {
    slug: "ceramic-coating",
    term: "セラミックコーティング",
    reading: "セラミックコーティング / ceramic coating",
    category: "coating",
    short: "無機セラミック系の被膜。高硬度・高耐久を謳う製品群。",
    definition:
      "無機系（多くは SiO₂ を主体とし、TiO₂ 等を含むものもある）のセラミック被膜を形成するコーティングの総称です。ガラスコーティングと重なる呼称ですが、より硬質・高耐久を特長として訴求されることが多い区分です。実際の性能は製品ごとに異なります。",
    related: ["glass-coating", "film-thickness", "hydrophilic-hydrophobic"],
  },
  {
    slug: "ppf",
    term: "PPF（ペイントプロテクションフィルム）",
    reading: "ピーピーエフ / paint protection film",
    category: "coating",
    short: "塗装面に貼る透明フィルム。飛び石・擦り傷から保護する。",
    definition:
      "TPU（熱可塑性ポリウレタン）等の透明フィルムを塗装面に貼り付け、飛び石・洗車傷・軽微な擦り傷から塗装を物理的に保護する製品です。温度で軽微な傷が復元する自己修復機能を持つ製品もあります。コーティングと併用されることもあります。",
    related: ["glass-coating", "coating-certificate", "vin"],
    seeAlso: { label: "NFC で施工を確認する", href: "/features/nfc" },
  },
  {
    slug: "hydrophilic-hydrophobic",
    term: "親水性・撥水性",
    reading: "しんすいせい・はっすいせい / hydrophilic・hydrophobic",
    category: "coating",
    short: "水が膜面で広がる（親水）か、弾いて水玉になる（撥水）かの性質。",
    definition:
      "コーティング被膜の表面性質を表す用語です。親水性は水が膜面に薄く広がって流れ落ちる性質、撥水性は水を弾いて水玉になる性質を指します。中間的な滑水性を謳う製品もあります。ウォータースポット（水シミ）の付きにくさなどに関わります。",
    related: ["glass-coating", "ceramic-coating"],
  },
  {
    slug: "film-thickness",
    term: "膜厚（塗膜厚）",
    reading: "まくあつ / film thickness",
    category: "coating",
    short: "塗膜の厚さ（μm）。膜厚計で計測し、再塗装・板金の判定材料になる。",
    definition:
      "塗装やコーティングの被膜の厚さで、通常マイクロメートル（μm）で表します。膜厚計で計測でき、部位ごとの数値のばらつきから再塗装や板金補修の痕跡を推定する手がかりになります。客観的な計測データとして施工品質の記録に用いられます。",
    related: ["repaint", "bodywork", "coating-certificate"],
    seeAlso: { label: "塗膜厚レポートの機能", href: "/features/thickness" },
  },
  // ── 整備・板金・仕上げ ─────────────────────────────
  {
    slug: "bodywork",
    term: "板金塗装",
    reading: "ばんきんとそう / bodywork & painting",
    category: "bodywork",
    short: "凹み・傷を成形（板金）し、塗装で仕上げる補修作業。",
    definition:
      "事故や経年でできたボディの凹み・傷を成形（板金）し、下地処理を経て塗装で仕上げる補修作業です。周囲の色と合わせる調色や、塗り分け範囲の判断に技術を要します。補修の有無や範囲は、後の査定や修復歴の判断に関わります。",
    related: ["repaint", "film-thickness", "repair-history", "polishing"],
  },
  {
    slug: "repaint",
    term: "再塗装",
    reading: "さいとそう / repaint",
    category: "bodywork",
    short: "工場出荷時の塗装をやり直すこと。膜厚や色味で判別されることがある。",
    definition:
      "工場出荷時の純正塗装を、補修や外観変更のために塗り直すことです。純正塗装と比べて膜厚が増える・色味や肌が微妙に異なるなどの特徴から、膜厚計測や目視で判別されることがあります。修復歴の有無とは別概念で、板金を伴わない再塗装もあります。",
    related: ["bodywork", "film-thickness", "repair-history"],
  },
  {
    slug: "polishing",
    term: "磨き（ポリッシング）",
    reading: "みがき / polishing",
    category: "bodywork",
    short: "塗装表面の微細な傷やくすみを研磨して整える作業。",
    definition:
      "コンパウンド（研磨剤）とポリッシャーを使い、塗装表面の細かな傷・水シミ・くすみを研磨して光沢を回復させる作業です。コーティングやPPFの施工前に下地を整える工程としても行われます。過度な研磨は塗膜を削るため、膜厚管理が重要です。",
    related: ["film-thickness", "glass-coating", "bodywork"],
  },
  // ── 保険・査定・流通 ─────────────────────────────
  {
    slug: "vehicle-insurance",
    term: "車両保険",
    reading: "しゃりょうほけん / vehicle insurance",
    category: "insurance",
    short: "自分の車の損害を補償する任意保険。査定に施工履歴が関わることがある。",
    definition:
      "自動車保険のうち、契約車両自身の損害（事故・盗難・自然災害など）を補償する任意保険です。損害査定では車両の状態や補修内容が確認され、施工・整備の履歴が判断材料になる場面があります。改ざんできない施工証明は、こうした確認のエビデンスになり得ます。",
    related: ["assessment", "repair-history", "coating-certificate"],
    seeAlso: { label: "保険会社向けの活用", href: "/for-insurers" },
  },
  {
    slug: "assessment",
    term: "査定",
    reading: "さてい / assessment",
    category: "insurance",
    short: "車両の価値や損害の程度を評価すること。履歴の透明性が精度を左右する。",
    definition:
      "車両の市場価値（買取・下取り）や、事故時の損害の程度を評価することです。年式・走行距離・修復歴に加え、コーティングやPPFなどの施工履歴も評価に影響し得ます。履歴が客観的に確認できるほど、評価のばらつきや水掛け論を減らせます。",
    related: ["repair-history", "vehicle-insurance", "coating-certificate"],
  },
  {
    slug: "repair-history",
    term: "修復歴",
    reading: "しゅうふくれき / repair history",
    category: "insurance",
    short: "車体の骨格部位を修復・交換した履歴。中古車評価の重要指標。",
    definition:
      "自動車の骨格（フレーム）にあたる部位を、事故等で修復・交換した履歴を指す中古車業界の用語です。外板の板金塗装や再塗装は、一般に修復歴には含まれません。中古車の価格・信頼性を大きく左右するため、正確な記録と開示が重要です。",
    related: ["assessment", "bodywork", "vehicle-insurance"],
  },
  // ── デジタル証明・技術 ─────────────────────────────
  {
    slug: "coating-certificate",
    term: "施工証明書",
    reading: "せこうしょうめいしょ / workmanship certificate",
    category: "tech",
    short: "施工内容・使用材料・日時・施工者を記録した証明書。Ledra の中核。",
    definition:
      "コーティング・PPF・板金などの施工について、内容・使用材料・施工日・施工者・写真などを記録した証明書です。紙の保証書に代えてデジタルで発行すれば、URLやQRで即時に共有でき、改ざん防止の仕組みと組み合わせることで第三者が真正性を確認できます。",
    related: ["blockchain", "digital-signature", "qr-code", "nfc"],
    seeAlso: { label: "デジタル施工証明書の機能", href: "/features/digital-certificate" },
  },
  {
    slug: "blockchain",
    term: "ブロックチェーン",
    reading: "ぶろっくちぇーん / blockchain",
    category: "tech",
    short: "改ざんが極めて困難な分散型の記録技術。証明の真正性担保に使う。",
    definition:
      "取引や記録を時系列に連結し、多数のノードで共有することで、後からの改ざんを極めて困難にする分散型台帳技術です。施工証明では、記録のハッシュ値をブロックチェーンに刻む（アンカリング）ことで、「その時点でその記録が存在した」ことを独立に検証可能にします。",
    related: ["hash", "timestamp", "coating-certificate", "digital-signature"],
    seeAlso: { label: "ブロックチェーン・アンカリング", href: "/features/blockchain-anchoring" },
  },
  {
    slug: "hash",
    term: "ハッシュ値",
    reading: "はっしゅち / hash",
    category: "tech",
    short: "データから算出する固定長の値。1文字変わると大きく変化する。",
    definition:
      "任意のデータから一定のアルゴリズム（例: SHA-256）で算出する固定長の値です。元データが 1 文字でも変われば結果が大きく変化するため、データが改変されていないことの検証に使えます。証明書や写真のハッシュ値を記録・照合することで、改ざんの有無を判定できます。",
    related: ["blockchain", "timestamp", "digital-signature"],
  },
  {
    slug: "timestamp",
    term: "タイムスタンプ",
    reading: "たいむすたんぷ / timestamp",
    category: "tech",
    short: "ある時点にデータが存在したことを示す時刻の証明。",
    definition:
      "特定の時刻にそのデータが存在していたことを示す、時刻の証明です。信頼できる第三者やブロックチェーンと組み合わせることで、「いつの記録か」を後から改ざんできない形で残せます。施工証明では、発行やアンカリングの時点を確定させる役割を担います。",
    related: ["blockchain", "hash", "coating-certificate"],
  },
  {
    slug: "digital-signature",
    term: "電子署名",
    reading: "でんししょめい / digital signature",
    category: "tech",
    short: "作成者の本人性と、内容が改ざんされていないことを示す仕組み。",
    definition:
      "公開鍵暗号を用いて、電子データの作成者が誰か（本人性）と、内容が署名後に改変されていないこと（完全性）を示す仕組みです。施工証明や同意書に付与することで、「誰が」「どの内容に」合意・発行したかを技術的に裏付けられます。",
    related: ["hash", "coating-certificate", "blockchain"],
    seeAlso: { label: "電子署名の機能", href: "/features/digital-signature" },
  },
  {
    slug: "qr-code",
    term: "QRコード",
    reading: "きゅーあーるこーど / QR code",
    category: "tech",
    short: "スマホで読み取れる二次元コード。証明書URLの共有に使う。",
    definition:
      "スマートフォンのカメラで読み取れる二次元コードです。施工証明書の公開URLをQRコードにすることで、顧客や保険会社・買い手がアプリのインストールなしに内容を確認できます。紙・現物に印字して現場で参照する使い方もされます。",
    related: ["coating-certificate", "nfc"],
  },
  {
    slug: "nfc",
    term: "NFC",
    reading: "エヌエフシー / near field communication",
    category: "tech",
    short: "近距離無線通信。スマホをかざして施工証明を開ける。",
    definition:
      "数センチの近距離でデータをやり取りする無線通信規格です。施工証明書を紐付けたNFCタグに対応スマートフォンをかざすだけで、施工履歴のページを開けます。中古車売買や再施工時に、口頭説明より確実な確認手段になります。",
    related: ["coating-certificate", "qr-code", "vin"],
    seeAlso: { label: "NFC 対応の機能", href: "/features/nfc" },
  },
  {
    slug: "vin",
    term: "VIN（車台番号）",
    reading: "ヴィン / vehicle identification number",
    category: "tech",
    short: "車両を一意に識別する番号。履歴を車に正しく紐付ける鍵。",
    definition:
      "車両を一意に識別するための番号（日本では車台番号に相当）です。施工・整備・証明の記録をVINに紐付けることで、履歴を「その車」に正確に結び付けられます。車検証OCRなどで読み取り、証明書や膜厚データの管理キーとして使われます。",
    related: ["coating-certificate", "repair-history", "nfc"],
    seeAlso: { label: "車検証OCRの機能", href: "/features/vehicle-ocr" },
  },
];

/** slug → 用語 の索引（存在しなければ undefined）。 */
export function getGlossaryTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.slug === slug);
}

/** カテゴリ順・五十音（term）順に整列した用語リスト。 */
export function listGlossaryByCategory(): { category: GlossaryCategory; terms: GlossaryTerm[] }[] {
  return (Object.keys(GLOSSARY_CATEGORIES) as GlossaryCategory[]).map((category) => ({
    category,
    terms: GLOSSARY.filter((t) => t.category === category),
  }));
}
