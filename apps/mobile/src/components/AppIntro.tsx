import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useVideoPlayer, VideoView } from "expo-video";

import {
  INTRO_FADE_MS,
  canPaint,
  msUntilExit,
  shouldShowVideo,
} from "@/lib/introTiming";

/**
 * コールドスタート時のオープニング。ブランドのロゴスティングを1回だけ再生する。
 *
 * ネイティブスプラッシュは単色 #d6d0cb (動画の背景クリーム) で、このコンポーネントの
 * 背景色と一致させてある。動画が描画可能になってから hideAsync() を呼べば継ぎ目が出ない。
 * 先に消すとデコード待ちのあいだ黒画面が挟まる。
 *
 * コールドスタート限定は追加コード不要。_layout.tsx はプロセスごとに1回しか
 * マウントされず、バックグラウンド復帰では再マウントされない。
 *
 * このコンポーネントはアプリ本体の手前に立ちはだかるので、どの分岐でも必ず
 * スプラッシュを剥がして onFinish に到達しなければならない。動画のデコード失敗や
 * 判定 API の無応答で永久に固まらないよう、待ちには全てタイムアウトを置いている。
 */
type Props = {
  /** 認証初期化(useAuthInit)が終わったか */
  ready: boolean;
  /** 退場フェードが終わってアプリ本体へ渡すとき */
  onFinish: () => void;
};

/** 動画背景のクリーム。app.json の splash.backgroundColor と揃える(実測値)。 */
const INTRO_BG = "#d6d0cb";
/** アプリ本体の背景。動画のクリームとは明度が違うので、切り替えではなくフェードで繋ぐ。 */
const APP_BG = "#fafafa";
/** モーション低減の判定を待つ上限。超えたら「低減なし」として進める。 */
const REDUCE_MOTION_PROBE_MS = 400;
/**
 * 動画の準備を待つ上限。267KB のローカル mp4 がこれだけ待っても再生可能に
 * ならないなら異常なので、失敗扱いにして演出を諦め、アプリ本体へ進む。
 * ここで諦めないと、スプラッシュを剥がしたあと動かない動画の前で永久に止まる。
 */
const VIDEO_READY_TIMEOUT_MS = 1500;
/** 退場フェードの完了コールバックを待つ上限。超えたら強制的にアプリ本体へ渡す。 */
const FADE_TIMEOUT_MS = INTRO_FADE_MS + 500;

export function AppIntro({ ready, onFinish }: Props) {
  // null = 判定中。判定が済むまで再生を始めない(モーション低減が有効な端末で一瞬でも動かさないため)
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [handoff, setHandoff] = useState(false);
  // 経過時間の基準は「動画が実際に見え始めた時刻」。マウント時ではない。
  // マウントからはモーション低減の判定(最大400ms)とデコード待ちが挟まるので、
  // マウント基準で測るとロックアップが完成する前に退場してしまう。
  const videoVisibleAt = useRef<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const exiting = useRef(false);

  const player = useVideoPlayer(
    require("../../assets/ledra-intro.mp4"),
    (p) => {
      p.loop = false;
      // 素材から音声トラック自体を削除済みだが、二重に防ぐ。
      // 起動のたびに音が鳴る／他アプリの再生を止めるのは論外なので。
      p.muted = true;
    },
  );

  useEffect(() => {
    let alive = true;
    const settle = (v: boolean) => {
      if (alive) setReduceMotion((prev) => (prev === null ? v : prev));
    };
    AccessibilityInfo.isReduceMotionEnabled().then(settle).catch(() => settle(false));
    // 判定が返ってこなくても先へ進む
    const id = setTimeout(() => settle(false), REDUCE_MOTION_PROBE_MS);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    const apply = (status: string) => {
      if (status === "readyToPlay") setVideoReady(true);
      else if (status === "error") setVideoFailed(true);
    };
    // useVideoPlayer は購読より前に読み込みを始めているので、
    // 先に届いてしまった statusChange を現在値から拾い直す。
    // これを怠ると videoReady が永久に false のままになる。
    apply(player.status);
    const sub = player.addListener("statusChange", ({ status }) => apply(status));
    return () => sub.remove();
  }, [player]);

  // モーション低減が無効と分かってから再生を始める
  const videoState = { reduceMotion, videoReady, videoFailed };
  const showVideo = shouldShowVideo(videoState);
  useEffect(() => {
    if (showVideo) player.play();
  }, [showVideo, player]);

  // 描ける状態になったらネイティブスプラッシュを外す。
  // 動画を出さない分岐(モーション低減・デコード失敗)では背景のクリームが
  // スプラッシュ画像とほぼ同じなので、そのまま外しても継ぎ目は見えない。
  const paintable = canPaint(videoState);
  useEffect(() => {
    if (paintable) {
      if (showVideo && videoVisibleAt.current === null) {
        videoVisibleAt.current = Date.now();
      }
      setHandoff(true);
      return;
    }
    // 保険: 動画の準備が返ってこなければ、失敗扱いにして演出を諦める。
    // showVideo が false になり、この効果が再実行されて handoff まで進む。
    const id = setTimeout(() => setVideoFailed(true), VIDEO_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [paintable, showVideo]);

  useEffect(() => {
    if (handoff) SplashScreen.hideAsync().catch(() => {});
  }, [handoff]);

  const startExit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinish();
    };
    // 保険: 完了コールバックが返らなくても必ずアプリ本体へ渡す。
    // ここで止まると、スプラッシュは剥がれた後なので不透明な #fafafa の
    // 一枚絵が残り続けることになる。
    const id = setTimeout(finish, FADE_TIMEOUT_MS);
    Animated.timing(fade, {
      toValue: 1,
      duration: INTRO_FADE_MS,
      useNativeDriver: true,
    }).start(() => {
      clearTimeout(id);
      finish();
    });
  }, [fade, onFinish]);

  useEffect(() => {
    if (!ready || reduceMotion === null) return;
    // 見せる演出が無い分岐(モーション低減・デコード失敗)では待つ意味がないので即抜ける
    if (!showVideo) {
      startExit();
      return;
    }
    // 動画がまだ見えていないなら、見え始めるまで退場を測り始めない
    // (videoVisibleAt が入ると videoReady が変わり、この効果が再実行される)
    const shownAt = videoVisibleAt.current;
    if (shownAt === null) return;
    const wait = msUntilExit(ready, Date.now() - shownAt);
    if (wait === null || wait <= 0) {
      startExit();
      return;
    }
    const id = setTimeout(startExit, wait);
    return () => clearTimeout(id);
  }, [ready, reduceMotion, showVideo, videoReady, startExit]);

  return (
    <View style={styles.container}>
      {showVideo && (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
      )}
      <Animated.View
        style={[styles.fade, { opacity: fade }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // SafeAreaView で包まない。ネイティブスプラッシュ(resizeMode: cover)と同じく
  // セーフエリアを含む画面全体を基準に敷く必要がある。
  container: { flex: 1, backgroundColor: INTRO_BG },
  fade: { ...StyleSheet.absoluteFillObject, backgroundColor: APP_BG },
});
