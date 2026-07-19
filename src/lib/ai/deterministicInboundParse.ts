/**
 * 受信メッセージから施工内容 (service) と車両 (vehicle) を **決定的に** 抽出する
 * フォールバック。AI 抽出 (inboundReservationExtract) が空を返したときだけ使う。
 *
 * 背景: LINE 受信の AI 抽出は同じ形式のメッセージでも service/vehicle を埋めたり
 * 埋めなかったりと不安定で (本番実績で 6 件中 2 件しか埋まらない)、空だと概算見積り
 * を含む下流の自動応答がすべて沈黙する。AI に頼り切らず、車メーカー/主要車種名と
 * 施工内容の固定辞書でキーワード一致を取ることで、明示的なメッセージ
 * (「トヨタ ハイエース 2026年式 ボディコーティング」等) を確実に拾う。
 *
 * ponytail: 辞書は固定リスト (naive heuristic)。天井: 辞書に無い車種・施工名は拾えない
 * (輸入車のマイナー車種、店舗固有の施工名など)。アップグレード経路: 施工内容は
 * テナントの menu_items (name/category_large)、車両はテナントの vehicles テーブルの
 * maker/model から語彙を動的生成して固定辞書に足し込む。
 *
 * IO を持たない純関数。単体テストで担保する。
 */

/**
 * 施工内容キーワード (自動車ディテイリング/整備)。長い (具体的な) ものを先に置く —
 * 「ボディコーティング」を「コーティング」より優先して拾うため。
 */
const SERVICE_KEYWORDS = [
  "ガラスコーティング",
  "セラミックコーティング",
  "ポリマーコーティング",
  "ボディコーティング",
  "ホイールコーティング",
  "ガラス系コーティング",
  "コーティング",
  "ヘッドライトクリーニング",
  "ヘッドライト磨き",
  "ヘッドライト",
  "室内クリーニング",
  "内装クリーニング",
  "ルームクリーニング",
  "シートクリーニング",
  "車内清掃",
  "手洗い洗車",
  "洗車",
  "鏡面仕上げ",
  "ポリッシュ",
  "磨き",
  "板金塗装",
  "板金",
  "塗装",
  "デントリペア",
  "へこみ",
  "傷消し",
  "キズ消し",
  "撥水加工",
  "撥水",
  "カーフィルム",
  "ウィンドウフィルム",
  "スモークフィルム",
  "フィルム",
];

/** 車メーカー名 (国産 + 主要輸入車)。 */
const VEHICLE_MAKERS = [
  "トヨタ",
  "レクサス",
  "ホンダ",
  "日産",
  "ニッサン",
  "マツダ",
  "スバル",
  "スズキ",
  "ダイハツ",
  "三菱",
  "ミツビシ",
  "いすゞ",
  "BMW",
  "ベンツ",
  "メルセデス",
  "アウディ",
  "フォルクスワーゲン",
  "ボルボ",
  "プジョー",
  "ポルシェ",
  "フェラーリ",
  "テスラ",
  "ジープ",
  "フィアット",
  "ルノー",
  "シトロエン",
  "ジャガー",
  "ランドローバー",
  // 「ミニ」(MINI) は「ミニバン」に誤マッチするため辞書から除外 (該当車は稀で、
  // 誤って「お車: ミニ」と概算に表示するリスクの方が大きい)。
];

/** 主要車種名 (メーカー名が本文に無くても車両と分かるモデル)。 */
const VEHICLE_MODELS = [
  "ハイエース",
  "アルファード",
  "ヴェルファイア",
  "ノア",
  "ヴォクシー",
  "エスクァイア",
  "プリウス",
  "アクア",
  "カローラ",
  "ヤリス",
  "ヴィッツ",
  "パッソ",
  "ルーミー",
  "ライズ",
  "ハリアー",
  "ランドクルーザー",
  "ランクル",
  "RAV4",
  "C-HR",
  "クラウン",
  "シエンタ",
  "N-BOX",
  "Nボックス",
  "フィット",
  "フリード",
  "ステップワゴン",
  "ヴェゼル",
  "オデッセイ",
  "シビック",
  "アコード",
  "セレナ",
  "ノート",
  "エクストレイル",
  "デイズ",
  "ルークス",
  "エルグランド",
  "スカイライン",
  "マーチ",
  "キューブ",
  "リーフ",
  "デミオ",
  "CX-5",
  "CX-3",
  "CX-8",
  "アクセラ",
  "アテンザ",
  "ロードスター",
  "スペーシア",
  "ワゴンR",
  "ハスラー",
  "ジムニー",
  "アルト",
  "ラパン",
  "スイフト",
  "ソリオ",
  "エブリイ",
  "タント",
  "ムーヴ",
  "ミラ",
  "キャスト",
  "ウェイク",
  "コペン",
  "タフト",
  "デリカ",
  "アウトランダー",
  "パジェロ",
  "フォレスター",
  "インプレッサ",
  "レガシィ",
  "レヴォーグ",
];

/**
 * 大小文字を無視した部分一致 (RAV4 / BMW / C-HR 等のラテン文字車種を「rav4」等の
 * 小文字入力でも拾うため)。カタカナ・漢字は toLowerCase の影響を受けない。
 */
function containsCI(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/** other が最長一致で既に採用済みの語の部分文字列かどうか。 */
function isSubstringOfAccepted(term: string, accepted: string[]): boolean {
  return accepted.some((a) => a !== term && a.includes(term));
}

/**
 * 施工内容を辞書一致で拾う。複数見つかれば元の並び順で ", " 連結する
 * (「ボディコーティング, ホイールコーティング」)。具体語が採れたら、その部分文字列に
 * すぎない一般語 (「コーティング」) は捨てる。
 */
function detectService(text: string): string | undefined {
  const lower = text.toLowerCase();
  const present = SERVICE_KEYWORDS.filter((k) => lower.includes(k.toLowerCase()));
  if (present.length === 0) return undefined;
  // 長い順に採用候補を確定 → 具体語を優先し、その部分文字列の一般語を除外。
  const byLenDesc = [...present].sort((a, b) => b.length - a.length);
  const accepted: string[] = [];
  for (const term of byLenDesc) {
    if (!isSubstringOfAccepted(term, accepted)) accepted.push(term);
  }
  // 出力は本文の登場順 (先頭からの index) に並べ直して自然な表記にする。
  const ordered = accepted.sort((a, b) => lower.indexOf(a.toLowerCase()) - lower.indexOf(b.toLowerCase()));
  return ordered.join(", ");
}

/** 年式トークン (「2026年式」「2025年」「令和6年」等) を 1 つだけ拾う。 */
function detectYear(text: string): string | undefined {
  const western = text.match(/(19|20)\d{2}\s*年(式)?/);
  if (western) return western[0].replace(/\s+/g, "");
  const wareki = text.match(/(令和|平成)\s*\d{1,2}\s*年(式)?/);
  if (wareki) return wareki[0].replace(/\s+/g, "");
  return undefined;
}

/** 本文に含まれる候補のうち最長 (最も具体的) の 1 つを返す。 */
function longestPresent(text: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  for (const c of candidates) {
    if (containsCI(text, c) && (!best || c.length > best.length)) best = c;
  }
  return best;
}

/** 車種辞書に混ぜる追加語彙 (vehicle_size_master 由来)。誤爆しやすい 2 文字以下は捨てる。 */
function mergeVocab(base: string[], extra?: string[]): string[] {
  if (!extra?.length) return base;
  const set = new Set(base);
  for (const e of extra) {
    const t = e?.trim();
    if (t && t.length >= 3) set.add(t);
  }
  return [...set];
}

/**
 * 車両をメーカー + 車種 + 年式の順で組み立てる。どれか 1 つでも見つかれば返す。
 * メーカー名は本文に無いことが多い (「ハイエースのコーティング」) ため車種単独でも可。
 * extraMakers/extraModels に vehicle_size_master のメーカー・車種を渡すと、辞書に無い
 * 車種 (アメ車の長い車種名等) も認識できる。複数一致時は最長 (最も具体的) を採る。
 */
function detectVehicle(text: string, opts?: DeterministicParseOptions): string | undefined {
  const maker = longestPresent(text, mergeVocab(VEHICLE_MAKERS, opts?.extraMakers));
  const model = longestPresent(text, mergeVocab(VEHICLE_MODELS, opts?.extraModels));
  const year = maker || model ? detectYear(text) : undefined;
  const parts = [maker, model, year].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export interface DeterministicParseResult {
  service?: string;
  vehicle?: string;
}

export interface DeterministicParseOptions {
  /** vehicle_size_master のメーカー名 (固定辞書に足す追加語彙)。 */
  extraMakers?: string[];
  /** vehicle_size_master の車種名 (固定辞書に足す追加語彙)。 */
  extraModels?: string[];
}

/**
 * 施工内容と車両を決定的に抽出する。見つからなければ undefined を返す。
 * AI 抽出が空だった場合の補完専用 (AI が埋めた値は上書きしない前提で呼ぶ)。
 * opts で vehicle_size_master 由来の語彙を渡すと車種認識のカバレッジが広がる。
 */
export function deterministicServiceVehicle(text: string, opts?: DeterministicParseOptions): DeterministicParseResult {
  const trimmed = text?.trim();
  if (!trimmed) return {};
  return {
    service: detectService(trimmed),
    vehicle: detectVehicle(trimmed, opts),
  };
}
