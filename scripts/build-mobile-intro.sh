#!/usr/bin/env bash
# モバイルアプリの起動オープニング動画と起動アセットを生成する。
#
#   ./scripts/build-mobile-intro.sh
#
# 必要なもの: ffmpeg と、ルートの npm 依存（Remotion）。
# Remotion が自前のヘッドレス Chrome を取得できない環境では、手元の Chrome を
# REMOTION_BROWSER=/path/to/headless_shell で渡す。
#
# オープニング動画の生成元は remotion/MobileIntro.tsx（ロゴを SVG で描き直したもの）。
# 以前は外部ツールで作った横長動画の一部を約1.8倍に引き伸ばしていて画質が荒かった
# （DECISION_LOG 2026-10-12）。ベクターから端末の解像度で直接書き出すので、拡大で荒れない。
#
# 動きの時間を変えたら apps/mobile/src/lib/introTiming.ts の前提
# （1.2 秒で完成・1.2〜2.0 秒は静止・2.0 秒で終わり）と突き合わせること。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/apps/mobile/assets"
BADGE="$ROOT/public/login-badge-source.png"

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

echo "==> イントロ動画 (Remotion: MobileIntro 1080x1920 / 60fps / 2.0s, 音声なし)"
# 拡張子に見える名前（mktemp 既定の tmp.XXXX）だと Remotion が連番の出力先と認めないので、点を含めない
FRAMES="$(mktemp -d "${TMPDIR:-/tmp}/mobile-intro-XXXXXX")"
trap 'rm -rf "$FRAMES"' EXIT
( cd "$ROOT" && npx remotion render remotion/index.tsx MobileIntro "$FRAMES" \
    --sequence --image-format=png ${REMOTION_BROWSER:+--browser-executable="$REMOTION_BROWSER"} --log=error )
# 連番 PNG から自分でエンコードする。Remotion の直接書き出しは yuvj420p（フルレンジ）になり、
# 端末によって背景のクリームがスプラッシュ（#d6d0cb）とずれうるため、BT.709 の TV レンジに揃える。
# -an        : 音声トラックを持たせない（起動のたびに音が鳴る／他アプリの再生を止めるのを防ぐ）
# +faststart : moov を先頭に置き、頭出しを速くする
ffmpeg -hide_banner -loglevel error -y -framerate 60 -i "$FRAMES/element-%03d.png" \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -an -movflags +faststart "$ASSETS/ledra-intro.mp4"

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
