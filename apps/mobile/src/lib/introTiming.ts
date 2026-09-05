/**
 * 起動オープニング(AppIntro)の退場判定。
 *
 * 定数は素材 assets/ledra-intro.mp4 の実測値に紐づく。素材を差し替えたら
 * scripts/build-mobile-intro.sh のコメントにある測定コマンドで測り直すこと。
 *
 * 実測(2026-08-23 時点の素材):
 *   - ロックアップ(Lマーク + LEDRA)が完成するのが 1.2 秒
 *   - 1.2〜2.0 秒はハイライトのスイープが止まっている静止区間
 *   - 動画は 2.0 秒で終わり、最終フレームも静止したロックアップ
 * つまり 1.2 秒以降ならどこで抜けても動きを断ち切らない。
 */

/** 起動処理が終わっていても、これより前には抜けない下限。ロックアップ完成 1.2 秒 + 余韻 0.3 秒。 */
export const INTRO_MIN_MS = 1500;

/** 退場フェードの長さ。動画の背景(クリーム)とアプリ本体の #fafafa の明度差を繋ぐ。 */
export const INTRO_FADE_MS = 350;

/**
 * どの経路も動かなかったときに、**強制的に演出を終わらせる**までの時間。
 *
 * 2つのことを同時にやる: ネイティブスプラッシュを剥がすことと、AppIntro を降ろすこと。
 * 剥がすだけでは足りない ―― AppIntro の退場は `ready`（認証初期化の完了）を条件に
 * しているので、初期化が返ってこないと**演出の最終フレームのまま固まる**。
 * 降ろせば少なくとも LoadingScreen（スピナー）が出る。
 *
 * **正常系より必ず長いこと。** 短いと普通の起動で演出を途中で切ってしまう。
 * 下限は INTRO_MIN_MS + INTRO_FADE_MS（＝正常系の最短）。自己チェックで固定している。
 */
export const SPLASH_FAILSAFE_MS = 5000;

export type IntroPhase = "playing" | "exiting";

/**
 * @param ready 認証初期化(useAuthInit)が終わったか
 * @param elapsedMs AppIntro がマウントされてからの経過時間
 */
export function introPhase(ready: boolean, elapsedMs: number): IntroPhase {
  if (!ready) return "playing";
  return elapsedMs >= INTRO_MIN_MS ? "exiting" : "playing";
}

/**
 * 次に退場判定をやり直すまでの待ち時間(ms)。0 なら今すぐ抜けられる。
 * ready を待っている間は再判定不要なので null を返す。
 */
export function msUntilExit(ready: boolean, elapsedMs: number): number | null {
  if (!ready) return null;
  return Math.max(0, INTRO_MIN_MS - elapsedMs);
}

/** AppIntro が退場判定に使う、動画側の状態。 */
export type IntroVideoState = {
  /** モーション低減の判定結果。null は判定中。 */
  reduceMotion: boolean | null;
  /** 動画が再生可能になったか */
  videoReady: boolean;
  /** 動画のデコードに失敗したか */
  videoFailed: boolean;
};

/** 動画を実際に画面に出すか。モーション低減時とデコード失敗時は出さない。 */
export function shouldShowVideo(s: IntroVideoState): boolean {
  return s.reduceMotion === false && !s.videoFailed;
}

/**
 * ネイティブスプラッシュを剥がしてよいか。
 *
 * 動画を出す分岐では「再生可能になってから」でないと、デコード待ちのあいだ
 * 黒画面が挟まる。動画を出さない分岐では背景のクリームがスプラッシュ画像と
 * ほぼ同じなので、すぐ剥がしてよい。
 *
 * これが false のまま返り続けるとアプリがスプラッシュの裏で永久に見えなくなるため、
 * 呼び出し側は必ずタイムアウトを併用すること。
 */
export function canPaint(s: IntroVideoState): boolean {
  if (s.reduceMotion === null) return false;
  return !shouldShowVideo(s) || s.videoReady;
}
