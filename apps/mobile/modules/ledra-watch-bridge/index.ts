import { requireOptionalNativeModule } from "expo-modules-core";

type WatchCredentials = {
  apiBaseURL: string;
  accessToken: string;
  storeID?: string;
};

type WatchBridgeEvents = {
  onOpenPhoto: (payload: { reservationId: string; stage?: PhotoStage }) => void;
};

export type PhotoStage = "intake_before" | "in_progress" | "after";

export type WorkActivityPayload = {
  reservationId: string;
  plate: string;
  title: string;
  currentStep: string;
  statusLabel: string;
  progress: number;
  expectedEndAt?: string;
};

export type PhotoResultPayload = {
  reservationId: string;
  success: boolean;
  message: string;
  count?: number;
};

type LedraWatchBridgeModule = {
  sync(credentials: WatchCredentials): Promise<boolean>;
  syncWorkActivity(payload: WorkActivityPayload): Promise<boolean>;
  endWorkActivity(reservationId: string): Promise<boolean>;
  reportPhotoResult(payload: PhotoResultPayload): Promise<boolean>;
  addListener(eventName: "onOpenPhoto", listener: WatchBridgeEvents["onOpenPhoto"]): { remove(): void };
};

const nativeModule = requireOptionalNativeModule<LedraWatchBridgeModule>("LedraWatchBridge");

export async function syncLedraWatch(credentials: WatchCredentials): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.sync(credentials);
}

export function addOpenPhotoListener(listener: WatchBridgeEvents["onOpenPhoto"]): { remove(): void } {
  return nativeModule?.addListener("onOpenPhoto", listener) ?? { remove() {} };
}

export async function syncWorkActivity(payload: WorkActivityPayload): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.syncWorkActivity(payload);
}

export async function endWorkActivity(reservationId: string): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.endWorkActivity(reservationId);
}

export async function reportPhotoResult(payload: PhotoResultPayload): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.reportPhotoResult(payload);
}
