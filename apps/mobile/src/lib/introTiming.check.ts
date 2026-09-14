// introTiming の自己チェック。フレームワーク不要。
// 実行: node --experimental-strip-types apps/mobile/src/lib/introTiming.check.ts
import assert from "node:assert";

import {
  INTRO_FADE_MS,
  INTRO_MIN_MS,
  canPaint,
  introPhase,
  msUntilExit,
  shouldShowVideo,
  SPLASH_FAILSAFE_MS,
  type IntroVideoState,
} from "./introTiming.ts";

// --- 起動処理が終わっていない間は、どれだけ経っても抜けない ---
// (機内モードなど useAuthInit にタイムアウトが無いケース。動画は最終フレームで静止して待つ)
assert.equal(introPhase(false, 0), "playing");
assert.equal(introPhase(false, INTRO_MIN_MS), "playing");
assert.equal(introPhase(false, 60_000), "playing");

// --- 起動処理が終わっても、下限までは演出を見せる ---
// (未ログインは起動処理が約300msで終わるため、ここを踏み外すと LEDRA が出る前に消える)
assert.equal(introPhase(true, 0), "playing");
assert.equal(introPhase(true, INTRO_MIN_MS - 1), "playing");

// --- 下限ちょうど、およびそれ以降は抜ける ---
assert.equal(introPhase(true, INTRO_MIN_MS), "exiting");
assert.equal(introPhase(true, INTRO_MIN_MS + 1), "exiting");
assert.equal(introPhase(true, 10_000), "exiting");

// --- 下限はロックアップ完成(実測1.2秒)より後、動画の尺(2.0秒)より前 ---
// この範囲を外れると、LEDRA が出きる前に消えるか、静止画を無駄に見せることになる
assert.ok(INTRO_MIN_MS > 1200, `INTRO_MIN_MS ${INTRO_MIN_MS} はロックアップ完成 1200ms より後であること`);
assert.ok(INTRO_MIN_MS <= 2000, `INTRO_MIN_MS ${INTRO_MIN_MS} は動画の尺 2000ms 以内であること`);

// --- 再判定までの待ち時間 ---
assert.equal(msUntilExit(false, 0), null); // ready 待ち中は再判定不要
assert.equal(msUntilExit(true, 0), INTRO_MIN_MS);
assert.equal(msUntilExit(true, 500), INTRO_MIN_MS - 500);
assert.equal(msUntilExit(true, INTRO_MIN_MS), 0);
assert.equal(msUntilExit(true, INTRO_MIN_MS + 999), 0); // 負にならない

// --- 待ち時間が 0 になる時刻と、phase が exiting に変わる時刻が一致する ---
for (const t of [0, 100, 1499, 1500, 3000]) {
  const wait = msUntilExit(true, t);
  assert.equal(
    introPhase(true, t) === "exiting",
    wait === 0,
    `t=${t} で phase と msUntilExit が食い違っている`,
  );
}

// --- 動画を出すかどうか ---
const st = (
  reduceMotion: boolean | null,
  videoReady = false,
  videoFailed = false,
): IntroVideoState => ({ reduceMotion, videoReady, videoFailed });

assert.equal(shouldShowVideo(st(null)), false); // 判定中は再生を始めない
assert.equal(shouldShowVideo(st(true)), false); // モーション低減 → 出さない
assert.equal(shouldShowVideo(st(false)), true);
assert.equal(shouldShowVideo(st(false, false, true)), false); // デコード失敗 → 出さない

// --- スプラッシュを剥がしてよいか ---
// 動画を出す分岐は「再生可能になってから」。先に剥がすと黒画面が挟まる
assert.equal(canPaint(st(false, false)), false);
assert.equal(canPaint(st(false, true)), true);
// 動画を出さない分岐は待つ必要がない
assert.equal(canPaint(st(true, false)), true);
assert.equal(canPaint(st(false, false, true)), true);
// 判定中だけは必ず false（ここはプローブのタイムアウトで必ず抜ける）
assert.equal(canPaint(st(null, true)), false);

// 判定さえ済めば、動画がどう転んでも必ず剥がせること。
// ここが崩れるとネイティブスプラッシュが出たままアプリが永久に見えなくなる。
for (const reduceMotion of [true, false]) {
  for (const videoReady of [true, false]) {
    for (const videoFailed of [true, false]) {
      const s = st(reduceMotion, videoReady, videoFailed);
      const stuck = !canPaint(s) && !(shouldShowVideo(s) && !videoReady);
      assert.ok(!stuck, `剥がせない状態が残っている: ${JSON.stringify(s)}`);
    }
  }
}

// 最後の砦は**正常系より必ず長い**こと。短くすると、普通の起動で演出を途中で切る。
// 認証初期化が遅い端末を考えて、最短経路の倍以上を確保する。
assert.ok(
  SPLASH_FAILSAFE_MS > INTRO_MIN_MS + INTRO_FADE_MS,
  `最後の砦(${SPLASH_FAILSAFE_MS}ms)が正常系の最短(${INTRO_MIN_MS + INTRO_FADE_MS}ms)以下`,
);
assert.ok(
  SPLASH_FAILSAFE_MS >= 2 * (INTRO_MIN_MS + INTRO_FADE_MS),
  "最後の砦の余裕が足りない（認証初期化が遅いと正常系を切る）",
);

console.log("introTiming self-check: OK");
