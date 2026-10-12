/**
 * デモ証明書ギャラリー用の画像を用意する。
 *
 * setup-demo-tenant のシードは certificate_images 行のメタデータだけを作り、
 * 実ファイルを Storage に置いていなかった。その結果、公開証明書ページの
 * <img src="…/object/public/assets/demo/LEDRA-DEMO-XXXX/NN.jpg"> が全て
 * Storage 400 (Object not found) を返し、ログが 400 で溢れていた。
 *
 * 各 storage_path には施工の種類ごとのデモ写真（scripts/demo-photos/<種類>/*.jpg、
 * AI 生成）を置く。その種類の写真がまだ無ければ軽量プレースホルダ JPEG で埋める。
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

export async function generateDemoPlaceholderJpeg(): Promise<Buffer> {
  const width = 1200;
  const height = 800;
  // テキストは ASCII のみ。sharp(librsvg/resvg) は環境の利用可能フォントで
  // ラスタライズするため、日本語フォント非搭載の環境で豆腐化しないよう避ける。
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#e5e7eb"/>
  <text x="50%" y="47%" font-family="sans-serif" font-size="72" font-weight="700" fill="#9ca3af" text-anchor="middle">LEDRA</text>
  <text x="50%" y="58%" font-family="sans-serif" font-size="34" fill="#9ca3af" text-anchor="middle">DEMO PHOTO</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
}

/** デモ証明書 → 写真フォルダ（scripts/demo-photos/<種類>）。setup-demo-tenant の CERTS と対で直す。 */
export const DEMO_PHOTO_CATEGORY: Record<string, string> = {
  "LEDRA-DEMO-0001": "coating",
  "LEDRA-DEMO-0002": "coating",
  "LEDRA-DEMO-0003": "ppf",
  "LEDRA-DEMO-0004": "coating",
  "LEDRA-DEMO-0005": "wrap",
  "LEDRA-DEMO-0006": "leather",
  "LEDRA-DEMO-0007": "window-film",
  "LEDRA-DEMO-0008": "coating",
  "LEDRA-DEMO-0009": "detailing",
  "LEDRA-DEMO-0010": "coating",
  "LEDRA-DEMO-0011": "coating",
  "LEDRA-DEMO-0012": "ppf",
  "LEDRA-DEMO-0013": "wheel",
  "LEDRA-DEMO-0014": "fabric",
  "LEDRA-DEMO-0015": "wheel",
  "LEDRA-DEMO-0016": "coating",
  "LEDRA-DEMO-0017": "coating",
  "LEDRA-DEMO-0018": "ppf",
  "LEDRA-DEMO-0019": "inspection",
  "LEDRA-DEMO-0020": "oil",
  "LEDRA-DEMO-0021": "coating",
  "LEDRA-DEMO-0022": "body-repair",
  "LEDRA-DEMO-0023": "inspection",
  "LEDRA-DEMO-0024": "wheel",
  "LEDRA-DEMO-0025": "inspection",
  "LEDRA-DEMO-0026": "coating",
  "LEDRA-DEMO-0027": "oil",
};

/**
 * 証明書 publicId の i 枚目（負数は末尾から）に使う画像。写真は種類フォルダ内の
 * ファイル名順で、作業の流れ（施工前 → 作業中 → 仕上がり）になるよう番号を振ってある。
 */
export async function demoPhotoFor(
  publicId: string,
  i: number,
  dir = join(__dirname, "demo-photos"),
): Promise<Buffer> {
  const category = DEMO_PHOTO_CATEGORY[publicId];
  const files = category
    ? (await readdir(join(dir, category)).catch(() => [] as string[])).filter((f) => f.endsWith(".jpg")).sort()
    : [];
  if (files.length === 0) return generateDemoPlaceholderJpeg();
  return readFile(join(dir, category, files[((i % files.length) + files.length) % files.length]));
}
