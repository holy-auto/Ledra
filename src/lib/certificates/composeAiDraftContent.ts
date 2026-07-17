/**
 * AI 下書き (証明書) を「施工内容フリーテキスト (content_free_text)」へ流し込む
 * 一本のテキストに組み立てる純関数。
 *
 * 背景: AI 下書き (AiDraftPanel) は title/description に加え、施工箇所 (workAreas)・
 * 使用材料 (materials)・保証候補 (warrantyCandidates) も生成してパネルに表示するが、
 * 従来はフォーム適用時に title/description/cautions しか流し込まず、残りは
 * 破棄されていた (表示だけで再入力が必要)。この関数は生成物を取りこぼさず
 * 施工内容へまとめる。値は下書きで、確定前に人が編集できる。
 *
 * ponytail: 構造化フィールド (coating_products_json 等) へは流し込まず、フリー
 * テキスト (content_free_text) に集約する簡略化。ceiling = 使用材料が
 * coating_products_json 等の構造化欄に入らない (施工内容テキストに残るのみ)。
 * upgrade path = 施工種別ごとに対応する構造化コンポーネントへ状態リフトして
 * 個別に流し込む。現行の適用先と同じで最小差分のため、まずはここに集約する。
 */

export interface DraftMaterialInput {
  name: string;
  maker?: string;
  spec?: string;
  note?: string;
}

export interface AiDraftApplyInput {
  title: string;
  description: string;
  cautions: string;
  materials?: DraftMaterialInput[];
  workAreas?: string[];
  warrantyCandidates?: string[];
}

/** 使用材料 1 件を "名称 / メーカー (仕様) — 備考" の 1 行に整形する。 */
function formatMaterial(m: DraftMaterialInput): string {
  const name = (m.name ?? "").trim();
  if (!name) return "";
  let line = name;
  const maker = (m.maker ?? "").trim();
  if (maker) line += ` / ${maker}`;
  const spec = (m.spec ?? "").trim();
  if (spec) line += ` (${spec})`;
  const note = (m.note ?? "").trim();
  if (note) line += ` — ${note}`;
  return line;
}

function cleanList(arr: string[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * AI 下書きを施工内容フリーテキストへ組み立てる。空セクションは出さない。
 * ブロック間は空行 1 つで区切る。
 */
export function composeAiDraftContent(draft: AiDraftApplyInput): string {
  const blocks: string[] = [];

  const head = [draft.title?.trim(), draft.description?.trim()].filter(Boolean).join("\n\n");
  if (head) blocks.push(head);

  const workAreas = cleanList(draft.workAreas);
  if (workAreas.length > 0) blocks.push(`【施工箇所】\n${workAreas.join("、")}`);

  const materials = (draft.materials ?? []).map(formatMaterial).filter(Boolean);
  if (materials.length > 0) blocks.push(`【使用材料】\n${materials.map((m) => `・${m}`).join("\n")}`);

  const warranty = cleanList(draft.warrantyCandidates);
  if (warranty.length > 0) blocks.push(`【保証（候補）】\n${warranty.join("、")}`);

  const cautions = (draft.cautions ?? "").trim();
  if (cautions) blocks.push(`【注意事項】\n${cautions}`);

  return blocks.join("\n\n");
}
