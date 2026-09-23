/**
 * .xlsx の1枚目のシートを文字列の2次元配列として読む（工数マスタのファイル登録用）。
 * xlsx は XML の zip なので、既存依存の jszip で開き DOMParser で読む（新しい依存を足さない）。
 * ponytail: 1枚目のシートの値だけを読む（書式・数式・結合セルは見ない）。天井: 複数シートや
 * 日付セルが要るようになったら、専用ライブラリ（exceljs 等）に置き換える。
 */
import JSZip from "jszip";

/** "C12" → 2（0 始まりの列番号）。 */
function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * 文字列セル（si / is）の本文。直下の <t> と、書式付きの <r> の中の <t> だけを繋ぐ。
 * 日本語 Excel が IME 入力で保存するふりがな（<rPh>）は読まない（「項目」が「項目コウモク」になるため）。
 */
function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  let out = "";
  for (const child of Array.from(el.children)) {
    if (child.localName === "t") out += child.textContent ?? "";
    else if (child.localName === "r")
      out += Array.from(child.children, (t) => (t.localName === "t" ? (t.textContent ?? "") : "")).join("");
  }
  return out;
}

export async function readXlsxRows(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const parse = async (path: string) => {
    const file = zip.file(path);
    return file ? new DOMParser().parseFromString(await file.async("string"), "application/xml") : null;
  };

  // 1枚目のシートのパス（workbook.xml の先頭 sheet → rels）。取れなければ sheet1.xml
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await parse("xl/workbook.xml");
  const rels = await parse("xl/_rels/workbook.xml.rels");
  const firstSheet = workbook?.getElementsByTagName("sheet")[0];
  const rid = firstSheet?.getAttribute("r:id");
  if (rid && rels) {
    const target = Array.from(rels.getElementsByTagName("Relationship"))
      .find((r) => r.getAttribute("Id") === rid)
      ?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }

  const shared = await parse("xl/sharedStrings.xml");
  const strings = shared ? Array.from(shared.getElementsByTagName("si"), (si) => textOf(si)) : [];
  const sheet = await parse(sheetPath);
  if (!sheet) throw new Error("シートが見つかりません");

  const rows: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName("row"))) {
    // xlsx は空行を保存しないので、行番号（r）どおりの位置に置く（エラーの「N行目」をずらさない）
    const rowNo = Number(row.getAttribute("r"));
    if (Number.isInteger(rowNo) && rowNo > 0) while (rows.length < rowNo - 1) rows.push([]);
    const out: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : out.length;
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const value =
        type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? textOf(c.getElementsByTagName("is")[0]) : v;
      while (out.length < col) out.push("");
      out[col] = value;
    }
    rows.push(out);
  }
  return rows;
}
