"use client";

import { useEffect, useState } from "react";
import {
  EXPERIMENTS,
  assignVariant,
  getExperimentUnitId,
  type ExperimentKey,
  type Variant,
} from "@/lib/marketing/experiments";
import { track, ANALYTICS_CONSENT_EVENT } from "@/lib/marketing/analytics";

/**
 * A/B 実験の文言を差し込む極小クライアントコンポーネント。
 *
 * - SSR とマウント直後は control を描画（ハイドレーション不整合を避ける）。
 * - マウント後に匿名 unitId からバケットを決めて切り替え、露出を計測。
 * - CTA ラベルとして使うと、CTAButton は children が文字列でないため
 *   data-cta-label を付けず、CTATracker が anchor.textContent（＝実際に出た
 *   variant 文言）を cta_clicked.label に記録する。露出とクリックが変種別に揃う。
 *
 * 露出の同意タイミング補正（重要）:
 *   初回訪問では PostHog が opt-out 既定のため、マウント時の露出送信は破棄される。
 *   一方クリックは同意後に捕捉されるため、補正しないと「未同意→同意」コホートで
 *   露出だけが欠落し、CVR = クリック/露出 の母数が壊れる。そこで同意付与イベントで
 *   露出を一度だけ再送信する（既に同意済みならマウント時に送信済みで、この
 *   イベントは発火しないため二重計上にならない）。
 */
export function ExperimentText({ experiment }: { experiment: ExperimentKey }) {
  const exp = EXPERIMENTS[experiment];
  const [variant, setVariant] = useState<Variant>("control");

  useEffect(() => {
    const v = assignVariant(experiment, getExperimentUnitId());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 意図的: SSR は control、マウント後にクライアントで variant を確定（ハイドレーション不整合回避）
    setVariant(v);
    const emit = () => track({ name: "experiment_exposed", props: { experiment, variant: v } });
    emit(); // 同意済みなら送信、未同意なら PostHog 側で破棄される
    window.addEventListener(ANALYTICS_CONSENT_EVENT, emit, { once: true });
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, emit);
  }, [experiment]);

  return <>{exp.variants[variant]}</>;
}
