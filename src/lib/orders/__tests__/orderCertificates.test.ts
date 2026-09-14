import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER_CERTIFICATE_ALLOWED_COLUMNS, ORDER_CERTIFICATE_FORBIDDEN_COLUMNS } from "@/lib/orders/orderCertificates";

/**
 * /api/admin/orders/[id] が返す施工証明の一覧は **相手方テナントにも返る**。
 * 元請けが発行した証明書を外注先に見せるのが目的なので、うっかり顧客由来の列を
 * 足すと他社への個人情報漏洩になる。
 *
 * 検査対象は **実際に走るルートの select literal**（モジュール側にコピーを置くと
 * コピーだけ直して本体が置き去りになる）。literal がそこにあるのは
 * scripts/check-schema.mjs が select の列を同一ファイル内の const からしか
 * 解決できないため。
 */
const ROUTE_PATH = "src/app/api/admin/orders/[id]/route.ts";
const routeSource = readFileSync(resolve(process.cwd(), ROUTE_PATH), "utf8");

/** ルートが実際に発行する select の列。取れなければテストを落とす（黙って空にしない）。 */
function selectedColumns(): string[] {
  const m = routeSource.match(/const ORDER_CERTIFICATE_SELECT = "([^"]+)";/);
  if (!m) throw new Error(`${ROUTE_PATH} から select literal を読み取れませんでした`);
  return m[1].split(/\s*,\s*/);
}

/** certificates を引くクエリチェーン（.from から文末まで）。 */
function certificateQuery(): string {
  const start = routeSource.indexOf('.from("certificates")');
  if (start < 0) throw new Error(`${ROUTE_PATH} に certificates のクエリが見つかりません`);
  const end = routeSource.indexOf(";", start);
  if (end < 0) throw new Error(`${ROUTE_PATH} の certificates クエリの終端が見つかりません`);
  return routeSource.slice(start, end);
}

describe("発注に紐づく施工証明の開示範囲", () => {
  it("ルートの select は許可リストと完全に一致する（列を足すと必ず落ちる）", () => {
    // 番人の本体。禁止リスト方式では「まだ誰も禁止と書いていない列」
    // （content_preset_json など、スタッフの入力がそのまま入る json）が
    // 素通りするため、許可リストとの完全一致で fail closed にしてある。
    expect(selectedColumns()).toEqual([...ORDER_CERTIFICATE_ALLOWED_COLUMNS]);
  });

  it("既知の顧客 PII と他社マスタへの識別子を含まない", () => {
    const columns = selectedColumns();
    for (const forbidden of ORDER_CERTIFICATE_FORBIDDEN_COLUMNS) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("相手方が証明書へ辿り着くのに必要な public_id を含む", () => {
    // public_id が落ちると、受注先は自分が施工した記録を開く手段を失う。
    expect(selectedColumns()).toContain("public_id");
  });

  it("発行元が引っ込めた証明書（is_hidden / void）を相手方に出さない", () => {
    // is_hidden は「ミスがあった証明書を一覧から外す」フラグ（20260619000000）。
    // 自社の一覧は除外するのに相手方には出し続ける、という状態を作らない。
    const query = certificateQuery();
    expect(query).toContain('.neq("status", "void")');
    expect(query).toContain('.eq("is_hidden", false)');
  });

  it("発注に紐づくものだけを引く", () => {
    // job_order_id のフィルタが落ちるとテナント内の全証明書が相手方に渡る。
    expect(certificateQuery()).toContain('.eq("job_order_id", id)');
  });
});
