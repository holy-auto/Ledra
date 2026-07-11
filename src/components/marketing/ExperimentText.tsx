"use client";

import { useEffect, useState } from "react";
import {
  EXPERIMENTS,
  assignVariant,
  getExperimentUnitId,
  type ExperimentKey,
  type Variant,
} from "@/lib/marketing/experiments";
import { track } from "@/lib/marketing/analytics";

/**
 * A/B 実験の文言を差し込む極小クライアントコンポーネント。
 *
 * - SSR とマウント直後は control を描画（ハイドレーション不整合を避ける）。
 * - マウント後に匿名 unitId からバケットを決めて切り替え、露出を 1 回だけ計測。
 * - CTA ラベルとして使うと、CTAButton は children が文字列でないため
 *   data-cta-label を付けず、CTATracker が anchor.textContent（＝実際に出た
 *   variant 文言）を cta_clicked.label に記録する。露出とクリックが変種別に揃う。
 */
export function ExperimentText({ experiment }: { experiment: ExperimentKey }) {
  const exp = EXPERIMENTS[experiment];
  const [variant, setVariant] = useState<Variant>("control");

  useEffect(() => {
    const v = assignVariant(experiment, getExperimentUnitId());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 意図的: SSR は control、マウント後にクライアントで variant を確定（ハイドレーション不整合回避）
    setVariant(v);
    track({ name: "experiment_exposed", props: { experiment, variant: v } });
  }, [experiment]);

  return <>{exp.variants[variant]}</>;
}
