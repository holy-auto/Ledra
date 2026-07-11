/**
 * 3D 証明書カードの表面テクスチャを Canvas 2D で描画する。
 *
 * 画像アセットを持たずにコードだけでブランド通りのカードを作るための実装。
 * 描画内容はデザインシステム準拠（ダーク基調 + Gold は「証明」の瞬間のみ）。
 * すべて決定的に描く（乱数を使わない）— スクリーンショット検証を安定させるため。
 */

export const CARD_W = 1024;
export const CARD_H = 640;
const R = 36; // 角丸

const GOLD = "#c9a55c";
const GOLD_DIM = "rgba(201,165,92,0.45)";

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** QR 風のブロック模様（決定的パターン） */
function drawQrLike(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const n = 9;
  const cell = size / n;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // 擬似ランダムだが決定的なビットパターン
      if ((i * 7 + j * 13 + ((i * j) % 5)) % 3 !== 0) continue;
      ctx.fillRect(x + i * cell, y + j * cell, cell - 1.5, cell - 1.5);
    }
  }
  // 3 隅のファインダーパターン
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  for (const [fx, fy] of [
    [x, y],
    [x + size - cell * 3, y],
    [x, y + size - cell * 3],
  ] as const) {
    ctx.strokeRect(fx + 1.5, fy + 1.5, cell * 3 - 3, cell * 3 - 3);
  }
}

export function drawCertificateTexture(canvas: HTMLCanvasElement): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ベース: 透明角丸 + ダークガラス
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, R);
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#101a2e");
  bg.addColorStop(0.55, "#0b1220");
  bg.addColorStop(1, "#0a0f1c");
  ctx.fillStyle = bg;
  ctx.fill();

  // 斜めの光沢
  const sheen = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  sheen.addColorStop(0.32, "rgba(255,255,255,0)");
  sheen.addColorStop(0.46, "rgba(255,255,255,0.075)");
  sheen.addColorStop(0.58, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();

  // Gold の枠線（外周 + 内側の細線）
  roundedRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, R - 4);
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 3;
  ctx.stroke();
  roundedRect(ctx, 16, 16, CARD_W - 32, CARD_H - 32, R - 12);
  ctx.strokeStyle = "rgba(201,165,92,0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ヘッダ
  ctx.fillStyle = GOLD;
  ctx.font = "600 30px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "alphabetic";
  const brand = "L E D R A";
  ctx.fillText(brand, 64, 96);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 44px 'Noto Sans JP', sans-serif";
  ctx.fillText("施工証明書", 64, 158);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "500 20px 'Noto Sans JP', sans-serif";
  ctx.fillText("CERTIFICATE OF WORKMANSHIP", 64, 192);
  // ヘッダ罫線 (gold)
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 216);
  ctx.lineTo(CARD_W - 64, 216);
  ctx.stroke();

  // データ行（ラベル + 値のダミー線）
  const rows: Array<[string, number]> = [
    ["車両", 300],
    ["施工内容", 420],
    ["施工日", 220],
    ["施工者", 260],
  ];
  let y = 272;
  for (const [label, w] of rows) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 21px 'Noto Sans JP', sans-serif";
    ctx.fillText(label, 64, y);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundedRect(ctx, 190, y - 20, w, 26, 6);
    ctx.fill();
    y += 62;
  }

  // ハッシュ行 (mono 風)
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "500 19px ui-monospace, monospace";
  ctx.fillText("sha256: 8a4f 09c2 4e1d 77b3 a6f0 2d9e c2e1 55ab", 64, y + 6);

  // QR 風 (右下)
  drawQrLike(ctx, CARD_W - 232, CARD_H - 236, 168);

  // Gold シール (左下)
  const sx = 128;
  const sy = CARD_H - 152;
  const seal = ctx.createRadialGradient(sx, sy, 6, sx, sy, 56);
  seal.addColorStop(0, "rgba(201,165,92,0.85)");
  seal.addColorStop(0.65, "rgba(201,165,92,0.35)");
  seal.addColorStop(1, "rgba(201,165,92,0.05)");
  ctx.fillStyle = seal;
  ctx.beginPath();
  ctx.arc(sx, sy, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#0a0f1c";
  ctx.font = "700 22px 'Noto Sans JP', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("認証", sx, sy + 8);
  ctx.textAlign = "left";

  // 検証済みラベル
  ctx.fillStyle = "rgba(52,211,153,0.9)";
  ctx.font = "600 20px 'Noto Sans JP', sans-serif";
  ctx.fillText("● ブロックチェーン検証済み", 210, CARD_H - 144);
}
