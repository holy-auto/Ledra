import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";

import { imageTypeFromUri } from "@/lib/imageType";

/**
 * 画像を1枚選ぶ共通処理（カメラ / ライブラリ）。
 *
 * 施工写真の撮影と顧客への画像送信で同じ手順を2回書いていたのでここに集約した。
 *
 * ponytail: 種別は **produced file の拡張子** から決める。`asset.mimeType` は
 * Android では**元ファイル**の MIME（HEIC のまま）なのに、書き出されたファイルは
 * quality < 1 の圧縮で実体が JPEG になっている。拡張子を見ないと「JPEG なのに
 * HEIC と判定して弾く」ことになる。iOS の mimeType は produced file の拡張子から
 * 作られているので、拡張子優先で両 OS とも正しくなる。
 */

export interface PickedImage {
  uri: string;
  /** multipart の filename */
  name: string;
  /** produced file の実体に対応する MIME */
  type: string;
  /** 書き出されたファイルの実サイズ（取れなければ null） */
  size: number | null;
}

/** 書き出されたファイルの実サイズ。asset.fileSize は Android では元ファイルのサイズ */
function actualSize(uri: string): number | null {
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const type = imageTypeFromUri(asset.uri) ?? asset.mimeType ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "bin";
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo.${ext}`,
    type,
    size: actualSize(asset.uri),
  };
}

export type PickResult =
  | { ok: true; image: PickedImage }
  /** ユーザーが取り消した。何も表示しない */
  | { ok: false; cancelled: true }
  /** 権限が無い・ピッカーが失敗した。理由を出すこと */
  | { ok: false; cancelled: false; message: string };

const CANCELLED = { ok: false, cancelled: true } as const;

export async function pickImageFromCamera(): Promise<PickResult> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      return { ok: false, cancelled: false, message: "カメラへのアクセスを許可してください" };
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return CANCELLED;
    return { ok: true, image: toPicked(result.assets[0]) };
  } catch (e) {
    // 投げっぱなしにすると「押しても何も起きない」になる
    return {
      ok: false,
      cancelled: false,
      message: e instanceof Error ? e.message : "カメラを起動できませんでした",
    };
  }
}

export async function pickImageFromLibrary(): Promise<PickResult> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      return { ok: false, cancelled: false, message: "写真へのアクセスを許可してください" };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
      // iOS 14+ のライブラリは既定で HEIC を返す。互換表現にさせて JPEG を受け取る
      // （Android では無視される。あちらは上の圧縮で JPEG になる）
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets?.[0]) return CANCELLED;
    return { ok: true, image: toPicked(result.assets[0]) };
  } catch (e) {
    return {
      ok: false,
      cancelled: false,
      message: e instanceof Error ? e.message : "写真を読み込めませんでした",
    };
  }
}

/** React Native の FormData ファイル形式で1枚積む */
export function appendImage(form: FormData, field: string, image: PickedImage): void {
  form.append(field, { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
}
