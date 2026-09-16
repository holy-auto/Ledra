import { Platform } from "react-native";
import {
  addOpenPhotoListener,
  endWorkActivity,
  reportPhotoResult,
  syncLedraWatch,
  syncWorkActivity,
  type PhotoResultPayload,
  type WorkActivityPayload,
} from "ledra-watch-bridge";
import { supabase } from "./supabase";

/** 最新の短期access tokenだけを、ペアリング済みApple Watchへ渡す。 */
export async function syncWatchSession(storeID?: string): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  const apiBaseURL = process.env.EXPO_PUBLIC_API_URL;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!apiBaseURL || !session?.access_token) return false;

  return syncLedraWatch({
    apiBaseURL,
    accessToken: session.access_token,
    ...(storeID ? { storeID } : {}),
  });
}

export async function updateWorkLiveActivity(payload: WorkActivityPayload): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return syncWorkActivity(payload);
}

export async function stopWorkLiveActivity(reservationId: string): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return endWorkActivity(reservationId);
}

export async function notifyWatchPhotoResult(payload: PhotoResultPayload): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return reportPhotoResult(payload);
}

export { addOpenPhotoListener };
