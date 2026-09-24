// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readXlsxRows } from "../readXlsxRows";

/** 最小の xlsx（共有文字列・インライン文字列・数値・空きセル）を組み立てる。 */
async function buildXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="labor" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/data.xml"/></Relationships>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>項目</t><rPh sb="0" eb="2"><t>コウモク</t></rPh></si><si><t>取付工数</t></si><si><r><t>ドア</t></r><r><t>バイザー</t></r></si></sst>`,
  );
  zip.file(
    "xl/worksheets/data.xml",
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>車台番号</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>JF5-1511014</t></is></c></row>
      <row r="4"><c r="B4"><v>0.4</v></c></row>
    </sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("readXlsxRows", () => {
  it("1枚目のシートを読み、共有文字列・インライン文字列・数値・空きセル・空行の位置を保ち、ふりがなは読まない", async () => {
    expect(await readXlsxRows(await buildXlsx())).toEqual([
      ["項目", "取付工数", "車台番号"],
      ["ドアバイザー", "", "JF5-1511014"],
      [],
      ["", "0.4"],
    ]);
  });
});
