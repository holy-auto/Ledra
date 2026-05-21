/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerOutboxBackgroundSync,
  triggerSwDrainOutbox,
  subscribeOutboxDrainedFromSw,
} from "@/lib/outbox/backgroundSync";

function mockNavigatorWithSw(opts: {
  syncRegister?: (tag: string) => Promise<void>;
  active?: { postMessage: (msg: unknown) => void } | null;
  noSyncProp?: boolean;
}) {
  const sync = opts.noSyncProp ? undefined : { register: opts.syncRegister ?? vi.fn(async () => {}) };
  const reg: any = { active: opts.active ?? null };
  if (sync) reg.sync = sync;

  const listeners: Array<(e: MessageEvent) => void> = [];
  const swContainer = {
    ready: Promise.resolve(reg),
    addEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
      listeners.push(fn);
    },
    removeEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    __listeners: listeners,
  };
  vi.stubGlobal("navigator", { serviceWorker: swContainer } as unknown as Navigator);
  return { reg, sync, swContainer, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerOutboxBackgroundSync", () => {
  it("returns false when serviceWorker is unavailable", async () => {
    vi.stubGlobal("navigator", {} as unknown as Navigator);
    const r = await registerOutboxBackgroundSync();
    expect(r).toBe(false);
  });

  it("returns false when sync is not supported (Firefox/Safari)", async () => {
    mockNavigatorWithSw({ noSyncProp: true });
    const r = await registerOutboxBackgroundSync();
    expect(r).toBe(false);
  });

  it("registers tag and returns true when supported", async () => {
    const syncRegister = vi.fn(async () => {});
    mockNavigatorWithSw({ syncRegister });
    const r = await registerOutboxBackgroundSync();
    expect(r).toBe(true);
    expect(syncRegister).toHaveBeenCalledWith("drain-outbox");
  });

  it("returns false when sync.register throws", async () => {
    mockNavigatorWithSw({
      syncRegister: vi.fn(async () => {
        throw new Error("permission denied");
      }),
    });
    const r = await registerOutboxBackgroundSync();
    expect(r).toBe(false);
  });
});

describe("triggerSwDrainOutbox", () => {
  it("returns false when no active worker", async () => {
    mockNavigatorWithSw({ active: null });
    const r = await triggerSwDrainOutbox();
    expect(r).toBe(false);
  });

  it("postMessages to the active SW", async () => {
    const postMessage = vi.fn();
    mockNavigatorWithSw({ active: { postMessage } });
    const r = await triggerSwDrainOutbox();
    expect(r).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "drain-outbox" });
  });
});

describe("subscribeOutboxDrainedFromSw", () => {
  it("calls callback only when message type matches", () => {
    const { listeners } = mockNavigatorWithSw({});
    const cb = vi.fn();
    const unsubscribe = subscribeOutboxDrainedFromSw(cb);
    expect(listeners).toHaveLength(1);

    // Wrong type → no call
    listeners[0]({ data: { type: "other" } } as MessageEvent);
    expect(cb).not.toHaveBeenCalled();

    // Right type → call
    listeners[0]({ data: { type: "outbox-drained" } } as MessageEvent);
    expect(cb).toHaveBeenCalledTimes(1);

    // unsubscribe
    unsubscribe();
    expect(listeners).toHaveLength(0);
  });

  it("returns no-op unsubscribe when serviceWorker is unavailable", () => {
    vi.stubGlobal("navigator", {} as unknown as Navigator);
    const unsubscribe = subscribeOutboxDrainedFromSw(() => {});
    expect(typeof unsubscribe).toBe("function");
    // Should not throw
    unsubscribe();
  });
});
