/**
 * 仮押さえ（reservation_holds）の純粋ヘルパ。
 *
 * 空き計算 `proposeCandidates` は占有を `reservations`(CandidateReservation[]) として受ける。
 * 有効な仮押さえも「占有」として合流させることで、押さえ済み枠の残数が正しく減る。
 * 副作用なし・DB 非依存でユニットテスト可能にする。
 */

import type { CandidateReservation } from "./candidates";

export type HoldLike = {
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  expires_at: string; // ISO
};

/** 仮押さえが「有効（枠を消費中）」か。pending かつ未失効。 */
export function isHoldActive(hold: HoldLike, now: Date): boolean {
  return hold.status === "pending" && new Date(hold.expires_at).getTime() > now.getTime();
}

/** 有効な仮押さえを占有(CandidateReservation)へ写像する（時間指定なので all_day=false）。 */
export function activeHoldsAsOccupants(holds: HoldLike[], now: Date): CandidateReservation[] {
  return holds
    .filter((h) => isHoldActive(h, now))
    .map((h) => ({
      scheduled_date: h.scheduled_date,
      start_time: h.start_time,
      end_time: h.end_time,
      all_day: false,
    }));
}

/** 実予約に有効な仮押さえを占有として合流した配列を返す（proposeCandidates の reservations 引数用）。 */
export function mergeHoldsIntoReservations(
  reservations: CandidateReservation[],
  holds: HoldLike[],
  now: Date,
): CandidateReservation[] {
  return [...reservations, ...activeHoldsAsOccupants(holds, now)];
}
