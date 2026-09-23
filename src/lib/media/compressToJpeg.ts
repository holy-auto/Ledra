/**
 * ブラウザで画像を JPEG に圧縮する（Vercel serverless の 4.5MB body 上限対策）。
 * 証明書写真アップロード・帳票の書類撮影取込で共用。
 */

// Stay well under Vercel's 4.5 MB serverless body limit.
export const TARGET_BYTES = 3.5 * 1024 * 1024; // 3.5 MB target after compression
const MAX_DIMENSION = 2048; // scale long side down to 2048 px before compressing

// Compress a File (already fully read into memory) to JPEG via Canvas.
// Scales dimensions then tries quality 0.85 → 0.70 → 0.55 until under TARGET_BYTES.
// iOS Safari natively decodes HEIC in Canvas (iOS 11+).
export async function compressToJpeg(file: File): Promise<File | null> {
  if (file.size <= TARGET_BYTES) return file;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = document.createElement("img");

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          resolve(null);
          return;
        }

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
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        const newName = file.name.replace(/\.[^.]+$/, ".jpg") || "photo.jpg";
        const qualities = [0.85, 0.7, 0.55];
        let qi = 0;

        const tryNext = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(null);
                return;
              }
              if (blob.size <= TARGET_BYTES || qi >= qualities.length - 1) {
                resolve(new File([blob], newName, { type: "image/jpeg" }));
              } else {
                qi++;
                tryNext();
              }
            },
            "image/jpeg",
            qualities[qi],
          );
        };

        tryNext();
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}
