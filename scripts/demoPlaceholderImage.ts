/**
 * デモ証明書ギャラリー用の軽量プレースホルダ JPEG を生成する。
 *
 * setup-demo-tenant のシードは certificate_images 行のメタデータだけを作り、
 * 実ファイルを Storage に置いていなかった。その結果、公開証明書ページの
 * <img src="…/object/public/assets/demo/LEDRA-DEMO-XXXX/NN.jpg"> が全て
 * Storage 400 (Object not found) を返し、ログが 400 で溢れていた。
 *
 * 各 storage_path に本バッファをアップロードして 400 を解消する。1 枚を
 * 全パスで使い回す（storage_path は UNIQUE 制約のためオブジェクトはパスごとに
 * 複製されるが、中身は同一で問題ない）。
 */
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
