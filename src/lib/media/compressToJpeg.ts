/**
 * ブラウザで画像を JPEG に圧縮する（Vercel serverless の 4.5MB body 上限対策）。
 * 証明書写真アップロード・帳票の書類撮影取込で共用。
 */

// Stay well under Vercel's 4.5 MB serverless body limit.
export const TARGET_BYTES = 3.5 * 1024 * 1024; // 3.5 MB target after compression
const MAX_DIMENSION = 2048; // scale long side down to 2048 px before compressing

// Compress a File to JPEG via Canvas.
// Scales dimensions then tries quality 0.85 → 0.70 → 0.55 until under TARGET_BYTES.
// createImageBitmap で直接デコードする（object URL を img.src に流さず、ユーザー選択
// ファイル由来の値が URL sink に到達する経路を作らない。PartInstallClient と同じ方式）。
export async function compressToJpeg(file: File): Promise<File | null> {
  if (file.size <= TARGET_BYTES) return file;

  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
    let w = bmp.width;
    let h = bmp.height;
    if (!w || !h) return null;

    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      if (w >= h) {
        h = Math.round((h * MAX_DIMENSION) / w);
        w = MAX_DIMENSION;
      } else {
        w = Math.round((w * MAX_DIMENSION) / h);
        h = MAX_DIMENSION;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);

    const newName = file.name.replace(/\.[^.]+$/, ".jpg") || "photo.jpg";
    const qualities = [0.85, 0.7, 0.55];
    for (let qi = 0; qi < qualities.length; qi++) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualities[qi]));
      if (!blob) return null;
      if (blob.size <= TARGET_BYTES || qi === qualities.length - 1) {
        return new File([blob], newName, { type: "image/jpeg" });
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    bmp?.close();
  }
}
