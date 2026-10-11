// メーカー商談用「連携レポート見本」のダミーデータ。
// 実データは読まない（見込みメーカーには実績が無いため、商談当日に空画面にならないよう固定値で見せる）。
// ponytail: 静的なダミー。実データ集計（証明書 × vehicles）は提携が決まった業種から API を足す。
// 項目は Ledra に実在するデータ項目だけで組む（各レポートの sources が出どころ）。

export type Src = "field" | "vehicle";
export type Pair = [label: string, value: number];

export type Chart =
  | {
      kind: "bars";
      items: Pair[];
      total?: number;
      max?: number;
      unit?: string;
      tone?: "accent" | "emerald" | "gold" | "amber";
    }
  | { kind: "stacked"; series: string[]; rows: [string, number[]][] }
  | { kind: "columns"; items: Pair[]; highlight?: number }
  | { kind: "table"; head: string[]; rows: (string | number)[][]; right?: number[] }
  | { kind: "thickness"; items: [panel: string, before: number, after: number][] }
  | { kind: "timeline"; items: Pair[] }
  | { kind: "damage"; points: [label: string, x: number, y: number, count: number][] };

export type Section = { title: string; src: Src[]; lead?: string; charts: Chart[]; note?: string };

export type SampleReport = {
  id: string;
  tab: string;
  sub: string;
  to: string;
  title: string;
  meta: [string, string][];
  kpis: { label: string; value: string; unit: string; src: Src[] }[];
  rows: Section[][];
  insights: [string, string][];
  sources: [metric: string, field: string, vehicle: string, recorded: boolean][];
};

export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const fmt = (n: number) => n.toLocaleString("ja-JP");
const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0");
const F: Src[] = ["field"];
const FV: Src[] = ["field", "vehicle"];

// 1. コーティング剤
const coatModels: Pair[] = [
  ["アルファード", 168],
  ["ハリアー", 142],
  ["ランドクルーザー250", 121],
  ["プリウス", 97],
  ["ヴェゼル", 88],
  ["セレナ", 76],
  ["CX-60", 64],
  ["N-BOX", 59],
  ["その他 64車種", 425],
];
export const coatTotal = sum(coatModels.map((x) => x[1]));
export const coatAge: Pair[] = [
  ["新車（1年未満）", 719],
  ["1〜3年", 273],
  ["4〜7年", 161],
  ["8年以上", 87],
];
const coatLot = 1141;
const coatPhoto = 1203;

// 2. PPF
export const ppfCars = 412;
const ppfParts: Pair[] = [
  ["フロントバンパー", 398],
  ["ボンネット", 391],
  ["フロントフェンダー", 297],
  ["ドアミラー", 281],
  ["ヘッドライト", 244],
  ["ドアカップ", 205],
  ["ロッカーパネル", 132],
  ["ルーフ", 86],
  ["フルラッピング", 41],
];
export const ppfFilmRows: [string, number[]][] = [
  ["SUV・クロカン", [96, 41, 18, 6]],
  ["スポーツ・輸入", [58, 22, 14, 5]],
  ["ミニバン・セダン", [132, 11, 7, 2]],
];
const ppfFilmAll = [0, 1, 2, 3].map((i) => sum(ppfFilmRows.map((r) => r[1][i])));
export const ftShops: [string, number, number, number][] = [
  ["施工店 01", 8, 0, 0],
  ["施工店 02", 6, 1, 0],
  ["施工店 03", 5, 1, 1],
  ["施工店 04", 6, 0, 0],
  ["施工店 05", 4, 2, 0],
  ["他7店", 23, 2, 1],
];
const ftPass = sum(ftShops.map((x) => x[1]));
const ftAll = sum(ftShops.map((x) => x[1] + x[2] + x[3]));
const ftDefects: [string, string, number][] = [
  ["エッジの浮き", "中", 6],
  ["気泡の残り", "軽微", 4],
  ["糊残り", "軽微", 2],
  ["端部のカット不良", "軽微", 1],
  ["黄ばみ", "重大", 1],
];

// 3. 自動車メーカー
export const oemModels: [string, number[]][] = [
  ["SUV-A", [410, 96, 210, 88]],
  ["ミニバン-B", [380, 40, 260, 102]],
  ["セダン-C", [150, 22, 190, 54]],
  ["コンパクト-D", [120, 8, 330, 68]],
  ["軽-E", [60, 2, 250, 20]],
];
const oemTotal = sum(oemModels.map((m) => sum(m[1])));
export const oemMaint = sum(oemModels.map((m) => m[1][2]));
// ミニバン-B の鈑金塗装の証明書に置かれた傷マーカーの数。座標は damage_map_json と同じ 0..1 正規化で、
// 作成画面・PDF・公開ページ共通の車両図（DAMAGE_DIAGRAM）に重ねる。1件の証明書に複数のマーカーが置かれうる。
// 部位名は見本用の振り分け（実データのマーカーは座標だけで部位を持たない）。
export const minivanDamage: [label: string, x: number, y: number, markers: number][] = [
  ["フロントバンパー", 0.5, 0.075, 31],
  ["ボンネット", 0.5, 0.17, 6],
  ["左Fフェンダー", 0.29, 0.21, 7],
  ["右Fフェンダー", 0.71, 0.21, 9],
  ["ルーフ", 0.5, 0.48, 1],
  ["左スライドドア", 0.28, 0.56, 12],
  ["右スライドドア", 0.72, 0.56, 14],
  ["左サイドステップ", 0.27, 0.71, 4],
  ["リアゲート・バンパー", 0.5, 0.9, 18],
];
const slideDoors = sum(minivanDamage.filter((p) => p[0].includes("スライドドア")).map((p) => p[3]));
const peakLabel = (items: Pair[]) => items.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
export const oemMileage: Pair[] = [
  ["〜1万km", 140],
  ["1〜3万", 310],
  ["3〜5万", 330],
  ["5〜10万", 380],
  ["10万〜", 80],
];

// 4. 補修塗料
const paintThick: [string, number, number][] = [
  ["ボンネット", 112, 168],
  ["フロントフェンダー", 108, 171],
  ["フロントドア", 105, 162],
  ["リアドア", 104, 159],
  ["リアフェンダー", 110, 176],
  ["ルーフ", 116, 165],
];
const paintStages: Pair[] = [
  ["受付→協定", 1.8],
  ["協定→鈑金開始", 2.4],
  ["鈑金", 2.1],
  ["塗装", 1.6],
  ["完成→納車", 0.9],
];

// 5. 部品・用品
const partModels: Pair[] = [
  ["プリウス", 204],
  ["アクア", 171],
  ["N-BOX", 158],
  ["ノート", 132],
  ["フリード", 118],
  ["その他", 1097],
];
const partTotal = sum(partModels.map((x) => x[1]));
const padMileage: Pair[] = [
  ["〜2万km", 18],
  ["2〜4万", 96],
  ["4〜6万", 241],
  ["6〜8万", 198],
  ["8〜10万", 87],
  ["10万〜", 31],
];
const padTotal = sum(padMileage.map((x) => x[1]));

const PERIOD: [string, string] = ["対象期間", "2026年4月〜9月"];

export const SAMPLE_REPORTS: SampleReport[] = [
  {
    id: "coating",
    tab: "コーティング剤",
    sub: "A社 ガラス系",
    to: "A化学株式会社 御中",
    title: "認定施工店 施工実績レポート（ガラスコーティング「A-Glass Pro」）",
    meta: [PERIOD, ["対象", "認定施工店 38店"]],
    kpis: [
      { label: "施工証明書の発行", value: fmt(coatTotal), unit: "件", src: F },
      { label: "ロット番号の記録率", value: pct(coatLot, coatTotal), unit: "%", src: F },
      { label: "Before/After 写真付き", value: pct(coatPhoto, coatTotal), unit: "%", src: F },
      { label: "新車への施工比率", value: pct(coatAge[0][1], coatTotal), unit: "%", src: FV },
    ],
    rows: [
      [
        {
          title: "車種別の施工件数",
          src: FV,
          charts: [{ kind: "bars", items: coatModels, total: coatTotal }],
          note: `上位8車種で全体の${pct(sum(coatModels.slice(0, 8).map((x) => x[1])), coatTotal)}%。大型SUV・ミニバンが上位で、1台あたりの使用量が多い層に偏っている。`,
        },
        {
          title: "車齢別の施工件数",
          src: FV,
          charts: [{ kind: "columns", items: coatAge, highlight: 0 }],
          note: "施工日と年式から算出。新車時の施工が過半を占める。",
        },
      ],
      [
        {
          title: "ロット番号から施工車両を逆引き",
          src: FV,
          lead: "例: ロット AGP-2409-B を使った施工 → 86 台 / 11 店舗",
          charts: [
            {
              kind: "table",
              head: ["施工日", "車種", "年式", "車台番号", "施工店"],
              rows: [
                ["2026-09-03", "ハリアー", 2025, "…4821", "施工店 07"],
                ["2026-09-05", "アルファード", 2026, "…0937", "施工店 02"],
                ["2026-09-06", "CX-60", 2024, "…5512", "施工店 15"],
                ["…", "他 83 台", "", "", ""],
              ],
            },
          ],
          note: "不具合ロットが出たとき、対象車両と施工店を即日で特定できる。",
        },
        {
          title: "品質フラグ（記録の抜け）",
          src: F,
          charts: [
            {
              kind: "bars",
              tone: "amber",
              items: [
                ["写真なし", coatTotal - coatPhoto],
                ["保証情報なし", 22],
                ["施工内容の記載なし", 9],
                ["ロット番号の未記録", coatTotal - coatLot],
              ],
            },
          ],
          note: "写真・保証・施工内容の抜けは、メーカーポータルの品質チェックで店舗別に確認できる。",
        },
      ],
    ],
    insights: [
      [
        "販路の実態",
        `新車施工が約${Math.round((coatAge[0][1] / coatTotal) * 100)}%。ディーラー経由の受注が主力で、経年車向けの訴求余地がある。`,
      ],
      ["使用量の予測", "車種とボディサイズが分かるので、店舗ごとの必要本数を見込める。"],
      ["品質管理", "ロット番号と写真の記録率を店舗別に出せる。認定更新の判断材料になる。"],
    ],
    sources: [
      ["車種別・車齢別の件数", "施工証明書・施工日", "メーカー・車種・年式", true],
      ["ロット逆引き", "使用製品の品番・ロット番号", "車台番号（下4桁表示）", true],
      ["写真・記録の抜け", "写真・保証情報・施工内容", "—", true],
      ["店舗別の必要本数の見込み", "施工件数", "ボディサイズ", false],
    ],
  },
  {
    id: "ppf",
    tab: "PPF・フィルム",
    sub: "B社",
    to: "Bフィルム株式会社 御中",
    title: "PPF 施工実績・新製品実証テスト レポート",
    meta: [PERIOD, ["対象", "取扱店 26店 / 実証テスト 12店"]],
    kpis: [
      { label: "PPF 施工台数", value: fmt(ppfCars), unit: "台", src: F },
      { label: "記録された施工パネル", value: fmt(sum(ppfParts.map((x) => x[1]))), unit: "枚", src: F },
      { label: "マット・サテン比率", value: pct(ppfFilmAll[1] + ppfFilmAll[2], ppfCars), unit: "%", src: F },
      { label: "実証テスト 合格率", value: pct(ftPass, ftAll), unit: "%", src: F },
    ],
    rows: [
      [
        {
          title: "部位別の施工率（1台あたり）",
          src: F,
          charts: [{ kind: "bars", items: ppfParts, total: ppfCars, max: ppfCars, tone: "emerald" }],
          note: `フロント3点（バンパー・ボンネット・フェンダー）が主流。フルラッピングは${pct(ppfParts[8][1], ppfCars)}%。`,
        },
        {
          title: "フィルムタイプ別",
          src: FV,
          charts: [
            {
              kind: "stacked",
              series: ["グロス", "マット", "サテン", "カラー"],
              rows: [["全体", ppfFilmAll], ...ppfFilmRows],
            },
          ],
          note: "マット系は SUV・スポーツ車に集中。ミニバンではほぼグロスのみ。",
        },
      ],
      [
        {
          title: "新製品「B-Film Gen3」実証テスト：店舗別の検査結果",
          src: F,
          charts: [{ kind: "table", head: ["施工店", "合格", "条件付き", "不合格"], rows: ftShops, right: [1, 2, 3] }],
          note: `合計 ${ftAll} 台。施工後の検査をメーカー側の基準で実施。`,
        },
        {
          title: "不具合報告（実証テスト）",
          src: F,
          charts: [{ kind: "table", head: ["内容", "重大度", "件数"], rows: ftDefects, right: [2] }],
          note: `計 ${sum(ftDefects.map((x) => x[2]))} 件。施工店・重大度・証跡写真つきで報告される。`,
        },
      ],
    ],
    insights: [
      ["パッケージ設計", "実際に選ばれている部位の組み合わせから、売れるセット商品を決められる。"],
      ["新製品の弱点", "不具合の内容と重大度から、改良すべき点の優先順位を付けられる。"],
      ["店舗の技術差", "合格率を店舗別に出せるので、研修の対象店を絞れる。"],
    ],
    sources: [
      ["部位別の施工率", "PPF 施工パネル・フル/部分", "—", true],
      ["フィルムタイプ×車種", "フィルムタイプ", "車種・ボディサイズ", true],
      ["実証テストの検査・不具合", "検査結果・不具合報告・証跡写真", "—", true],
      ["車種カテゴリの分類", "—", "車種", false],
    ],
  },
  {
    id: "oem",
    tab: "自動車メーカー",
    sub: "C自動車",
    to: "C自動車株式会社 御中",
    title: "貴社車両のアフターマーケット施工・整備 レポート",
    meta: [PERIOD, ["対象", "Ledra 導入の施工店・整備工場 142店"]],
    kpis: [
      { label: "貴社車両の施工・整備記録", value: fmt(oemTotal), unit: "件", src: FV },
      { label: "うち鈑金塗装", value: fmt(sum(oemModels.map((m) => m[1][3]))), unit: "件", src: FV },
      { label: "うち整備", value: fmt(oemMaint), unit: "件", src: FV },
      {
        label: "コーティング・PPF 比率",
        value: pct(sum(oemModels.map((m) => m[1][0] + m[1][1])), oemTotal),
        unit: "%",
        src: FV,
      },
    ],
    rows: [
      [
        {
          title: "車種別のアフター施工の内訳",
          src: FV,
          charts: [{ kind: "stacked", series: ["コーティング", "PPF", "整備", "鈑金塗装"], rows: oemModels }],
          note: "SUV・ミニバンは外装の保護施工、コンパクト・軽は整備が中心。",
        },
        {
          title: "整備記録の走行距離帯",
          src: FV,
          charts: [{ kind: "columns", items: oemMileage, highlight: 3 }],
          note: `整備 ${fmt(oemMaint)} 件を入庫時の走行距離で集計。`,
        },
      ],
      [
        {
          title: "ミニバン-B：鈑金塗装の傷の位置（マーカー）",
          src: FV,
          charts: [{ kind: "damage", points: minivanDamage }],
          note: `円の大きさ＝マーカー数。鈑金塗装の証明書に置かれた傷マーカー ${sum(minivanDamage.map((p) => p[3]))} 個を、証明書と同じ車両図に重ねた集計（1件に複数置かれることがある）。`,
        },
      ],
    ],
    insights: [
      [
        "設計・品質へのフィードバック",
        `ミニバン-B はスライドドア周辺の傷マーカーが左右で ${slideDoors} 個。乗降時の接触が多い部位を特定できる。`,
      ],
      ["認定中古車の付加価値", "施工・整備の履歴が車台番号に紐づくので、下取り・再販時に履歴を証明できる。"],
      ["ディーラー外の実態", "正規ディーラー以外でどんな施工・整備がされているかが見える。"],
    ],
    sources: [
      ["車種別の施工内訳", "施工証明書（種別）", "メーカー・車種", true],
      ["走行距離帯", "整備記録", "走行距離の記録", true],
      ["傷の位置の重ね合わせ", "傷の位置マーカー（座標）", "車種", true],
      ["部位別の件数（座標から部位を判定）", "傷の位置マーカー（座標）", "車種", false],
      ["複数施工店をまたいだ集計の提供", "全施工店の記録", "貴社車両の抽出", false],
    ],
  },
  {
    id: "paint",
    tab: "補修塗料",
    sub: "D社",
    to: "Dペイント株式会社 御中",
    title: "鈑金塗装 施工品質・工程レポート",
    meta: [PERIOD, ["対象", "取引先の鈑金塗装工場 21店"]],
    kpis: [
      { label: "鈑金塗装の証明書", value: "540", unit: "件", src: F },
      { label: "膜厚の測定記録", value: fmt(1960), unit: "箇所", src: F },
      {
        label: "補修による膜厚の増加（平均）",
        value: String(Math.round(sum(paintThick.map((x) => x[2] - x[1])) / paintThick.length)),
        unit: "µm",
        src: F,
      },
      { label: "入庫から納車まで（平均）", value: sum(paintStages.map((s) => s[1])).toFixed(1), unit: "日", src: F },
    ],
    rows: [
      [
        {
          title: "部位別の膜厚（補修前→補修後の平均）",
          src: F,
          charts: [{ kind: "thickness", items: paintThick }],
          note: "膜厚計の測定値を部位ごとに記録。補修範囲と塗り重ねの量が数字で残る。",
        },
        {
          title: "工程別の平均日数",
          src: FV,
          charts: [
            { kind: "timeline", items: paintStages },
            {
              kind: "bars",
              tone: "gold",
              unit: "日",
              items: [
                ["軽", 6.9],
                ["S・M", 8.4],
                ["L", 9.6],
                ["LL・輸入大型", 11.8],
              ],
            },
          ],
          note: `上: 全体の工程別。下: ボディサイズ別の入庫〜納車日数。最も長いのは「${peakLabel(paintStages)}」。`,
        },
      ],
    ],
    insights: [
      ["塗料の使用量", "部位・膜厚・ボディサイズから、1件あたりの使用量を見積もれる。"],
      ["新製品の効果測定", "速乾タイプへの切替前後で「塗装」工程の日数を比べられる。"],
      ["品質の裏付け", "膜厚の記録が保険会社・車両所有者への説明資料になる。"],
    ],
    sources: [
      ["部位別の膜厚", "膜厚の測定記録（補修前・後）", "—", true],
      ["工程別の日数", "受付・協定・鈑金・塗装・完成・納車の日時", "—", true],
      ["ボディサイズ別の日数", "工程の日時", "ボディサイズ", true],
      ["使用塗料の銘柄別集計", "使用材料の記録", "—", false],
    ],
  },
  {
    id: "parts",
    tab: "部品・用品",
    sub: "E社 ブレーキ",
    to: "E工業株式会社 御中",
    title: "部品取付・交換サイクル レポート（ブレーキパッド・バッテリー）",
    meta: [PERIOD, ["対象", "取扱整備工場 64店"]],
    kpis: [
      { label: "取付記録", value: fmt(partTotal), unit: "件", src: F },
      { label: "納品書と取付記録の照合一致", value: pct(1812, partTotal), unit: "%", src: F },
      { label: "顧客による取付確認（署名）", value: pct(1335, partTotal), unit: "%", src: F },
      { label: "次回交換時期が3か月以内", value: "214", unit: "台", src: FV },
    ],
    rows: [
      [
        {
          title: "ブレーキパッド：交換時の走行距離",
          src: FV,
          charts: [{ kind: "columns", items: padMileage, highlight: 2 }],
          note: `パッド交換 ${padTotal} 件。${peakLabel(padMileage)} がピーク。`,
        },
        {
          title: "車種別の取付件数",
          src: FV,
          charts: [{ kind: "bars", items: partModels, total: partTotal, tone: "emerald" }],
          note: "ハイブリッド車・軽が上位。",
        },
      ],
    ],
    insights: [
      ["需要予測", "次回交換の見込み時期・走行距離から、需要を先読みできる。"],
      ["正規品の流通確認", "納品書と取付記録の照合で、取付台数と出荷数量のずれを検知できる。"],
      ["製品寿命の実データ", "車種別の交換サイクルを、カタログ値と比べられる。"],
    ],
    sources: [
      ["交換時の走行距離", "部品交換記録", "走行距離の記録", true],
      ["納品書との照合", "納品書の読み取り・取付記録", "—", true],
      ["顧客による取付確認", "顧客の確認・電子署名", "—", true],
      ["次回交換時期の見込み", "部品交換記録（次回見込み）", "車両", true],
      ["地域別の需要集計", "施工店の所在地", "—", false],
    ],
  },
];
