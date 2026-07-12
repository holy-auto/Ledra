// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ExperimentText } from "../ExperimentText";
import { ANALYTICS_CONSENT_EVENT } from "@/lib/marketing/analytics";

type PH = { capture: ReturnType<typeof vi.fn> };

describe("ExperimentText 露出計測", () => {
  let capture: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capture = vi.fn();
    (window as unknown as { posthog: PH }).posthog = { capture };
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { posthog?: PH }).posthog;
  });

  it("マウント時に experiment_exposed を送信する", () => {
    act(() => {
      render(<ExperimentText experiment="hero_primary_cta" />);
    });
    expect(capture).toHaveBeenCalledWith(
      "experiment_exposed",
      expect.objectContaining({ experiment: "hero_primary_cta" }),
    );
  });

  it("同意付与イベントで露出を再送信する（未同意→同意コホートの母数ズレ防止）", () => {
    act(() => {
      render(<ExperimentText experiment="hero_primary_cta" />);
    });
    capture.mockClear();
    act(() => {
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
    });
    expect(capture).toHaveBeenCalledWith(
      "experiment_exposed",
      expect.objectContaining({ experiment: "hero_primary_cta" }),
    );
  });

  it("control/treatment いずれかの文言を描画する", () => {
    const { container } = render(<ExperimentText experiment="hero_primary_cta" />);
    const text = container.textContent ?? "";
    expect(["無料で試す", "5分で証明書を発行"]).toContain(text);
  });
});
