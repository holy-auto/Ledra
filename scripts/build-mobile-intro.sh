#!/usr/bin/env bash
# モバイルアプリの起動オープニング動作と起動アセットを、ブランドのマスター素材から生成する。
#
#   ./scripts/build-mobile-intro.sh <イントロ動画のマスター.mp4>
#
# 必要なもの: ffmpeg のみ（画像処理も ffmpeg で完結させ、依存を1つに抑えている）
#
# マスター素材はリポジトリに入れていない（生成ツールのウォーターマークが乗っているため、
# 誤ってそのまま使われるのを避ける）。代表が保持しているものを引数で渡す。
#
# 素材を差し替えたら、下の定数を必ず測り直すこと。測定コマンドは
# docs/context/RELEASE_LOG.md の該当エントリと、この下のコメントに書いてある。

set -euo pipefail

MASTER="${1:-}"
if [[ -z "$MASTER" || ! -f "$MASTER" ]]; then
  echo "usage: $0 <イントロ動画のマスター.mp4>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/apps/mobile/assets"
BADGE="$ROOT/public/login-badge-source.png"

# --- マスター素材の実測値 -------------------------------------------------
# マスターは 1920x1080 のキャンバスに 9:16 の縦パネルが白でピラーボックスされている。
PANEL_X=656          # 縦パネルの左端
PANEL_W=608          # 縦パネルの幅 (608:1080 = 0.5630 ≒ 9:16)
PANEL_H=970          # 下端 110px を落とす。ウォーターマーク(中心 y≈997, 半径≈23)を画角外にするため。
                     # LEDRA の下端は y≈732 なのでロゴは切れない。
CUT_SEC=2.00         # 1回目のハイライトスイープが始まる 2.20 秒の手前で切る。
                     # 末尾フレームの高輝度画素が 0 = 完全に静止した状態で終わるので、
                     # 動きが途中で断ち切られない。末尾2秒の白い余り尺もこれで落ちる。
                     # 測定: ffmpeg -i <master> -vf "crop=608:560:656:220,scale=76:70" \
                     #   -f rawvideo -pix_fmt gray - | (30fps 刻みで v>=238 の画素数を数える)

# --- ブランドロゴ(Lマーク)の実測クロップ座標 ------------------------------
# public/login-badge-source.png (1376x768, RGBA, 背景透過) 内の L マークの bbox
MARK_X=195; MARK_Y=152; MARK_W=303; MARK_H=433

# 切り出した L マークを、指定の高さで透過キャンバスの中央に置く
# $1=出力 $2=キャンバス辺 $3=Lマークの高さ $4=追加フィルタ
place_mark() {
  local out="$1" canvas="$2" mh="$3" extra="${4:-null}"
  local mw=$(( (MARK_W * mh + MARK_H / 2) / MARK_H ))
  local px=$(( (canvas - mw) / 2 )) py=$(( (canvas - mh) / 2 ))
  ffmpeg -hide_banner -loglevel error -y -i "$BADGE" \
    -vf "crop=${MARK_W}:${MARK_H}:${MARK_X}:${MARK_Y},scale=${mw}:${mh},pad=${canvas}:${canvas}:${px}:${py}:color=0x00000000,${extra}" \
    -pix_fmt rgba -frames:v 1 "$out"
}

echo "==> イントロ動画 (${CUT_SEC}s, 音声なし)"
# crop        : 白のピラーボックスを除去し、同時にウォーターマークを画角外へ
# 下端 198px  : 切り落とした分を最下行の色を引き伸ばして埋め戻す。
#               scale=16:2 を挟んで横方向を平均化しているのは、素の引き伸ばしだと縦縞が出るため。
# -an         : 音声トラックを削除（起動のたびに音が鳴る／他アプリの再生を止めるのを防ぐ）
# +faststart  : moov を先頭に置き、頭出しを速くする
ffmpeg -hide_banner -loglevel error -y -t "$CUT_SEC" -i "$MASTER" -filter_complex \
  "[0:v]crop=${PANEL_W}:${PANEL_H}:${PANEL_X}:0,scale=1080:1722,format=yuv420p,split=2[m][b];\
   [b]crop=1080:6:0:1716,scale=16:2,scale=1080:198:flags=bicubic,format=yuv420p[bot];\
   [m][bot]vstack=inputs=2" \
  -an -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart \
  "$ASSETS/ledra-intro.mp4"

echo "==> スプラッシュ (背景と同色 = 見えないアイコン)"
# 狙いは「単色スプラッシュ」だが、画像を持たせない設定は Expo からは選べない。
#   @expo/prebuild-config/.../withAndroidSplashStyles.js:56-60 の addSplashScreenStyle は
#   splashConfig を一切見ず、windowSplashScreenAnimatedIcon -> @drawable/splashscreen_logo を
#   無条件に styles.xml へ書く。一方 drawable を書く withAndroidSplashImages.js:163 は
#   if (image) で守られているので、image が無いと参照だけ残って AAPT2 が
#   "resource drawable/splashscreen_logo not found" で落ちる（実際に15分ビルドして踏んだ）。
# そこで背景と同じ #d6d0cb の単色 PNG を渡し、「描画はされるが見えない」形にする。
# 透明 PNG ではなく単色にしているのは、アイコンが空のときアプリアイコンに
# フォールバックする OEM 実装がありうるため。同色なら挙動に依存しない。
#
# フルブリードのスプラッシュ画像は Android では原理的に実現できない。
# Android 12+ のスプラッシュAPIは「単色の上に中央のアイコン」しか描けず、
# legacy splash 経路では imageWidth が 200dp にハードコードされている
# (getAndroidSplashConfig.js:52)。動画のフレーム0はビネット以外ほぼ一様な
# クリームなので、単色で置き換えても再生開始の継ぎ目はほぼ見えない。
# format=rgb24 はフィルタグラフの中に置くこと。外の -pix_fmt rgb24 だけだと
# color ソースが YUV で作ってから変換するため d5cfca になり、背景色と1ずつずれる。
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0xd6d0cb:s=512x512,format=rgb24" -frames:v 1 \
  "$ASSETS/splash-icon.png"

echo "==> アプリアイコン (iOS はアルファ不可なので白でフラット化)"
MARK_H_ICON=620
MARK_W_ICON=$(( (MARK_W * MARK_H_ICON + MARK_H / 2) / MARK_H ))
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=white:s=1024x1024" -i "$BADGE" \
  -filter_complex "[1:v]crop=${MARK_W}:${MARK_H}:${MARK_X}:${MARK_Y},scale=${MARK_W_ICON}:${MARK_H_ICON}[l];\
   [0:v][l]overlay=(W-w)/2:(H-h)/2,format=rgb24" \
  -frames:v 1 "$ASSETS/icon.png"

echo "==> Android アダプティブアイコン (セーフゾーン 66% 以内に収める)"
place_mark "$ASSETS/android-icon-foreground.png" 512 250
# モノクロ版: 形状はアルファで表現し、RGB は 0 に潰す
place_mark "$ASSETS/android-icon-monochrome.png" 512 250 \
  "colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=0"

echo
echo "==> 生成結果"
ls -la "$ASSETS"
