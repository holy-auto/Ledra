"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { isHeroWebglCapable, readHeroWebglEnv } from "@/lib/marketing/heroWebglGate";
import { WebglErrorBoundary } from "./WebglErrorBoundary";

/**
 * Hero 右カラムの 3D 演出ゲート。
 *
 * - children（実プロダクトのスクショ）は常に SSR され、LCP を担う。
 * - 対応デバイス（heroWebglGate）でのみ、アイドル時に 3D チャンクを遅延ロードし、
 *   スクショの上にクロスフェードで重ねる。
 * - 非対応・低速・reduced-motion・モバイル・WebGL 不可では何もしない（スクショのまま）。
 *   3D は演出であり、決して LCP/INP を犠牲にしない — 提案書 P3 の方針どおり。
 *
 * 堅牢性の要点:
 * - クロスフェードは固定タイマーではなく Canvas の onCreated（実描画開始）で駆動。
 *   チャンク到着が遅くてもポスターが先に消えて空白になることがない。
 * - 3D が throw してもポスターページを巻き添えにしない（WebglErrorBoundary）。
 * - ヒーローがビューポート外の間は frameloop を止める（active=false）。
 * - フェード後もポスターを a11y ツリーに残す（視覚は透明・操作は無効化のみ）。
 */

const CertificateScene = dynamic(() => import("./CertificateScene"), { ssr: false });

export function Hero3DCertificate({ children }: { children: ReactNode }) {
  const [show3d, setShow3d] = useState(false);
  const [ready, setReady] = useState(false); // Canvas が実描画を開始した
  const [failed, setFailed] = useState(false); // 3D が throw した → ポスターに戻す
  const [inView, setInView] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHeroWebglCapable(readHeroWebglEnv())) return;
    // WebGL コンテキストを実際に作れるか実測。作れたら即解放してリークを防ぐ。
    try {
      const probe = document.createElement("canvas");
      const ctx = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
      if (!ctx) return;
      ctx.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      return;
    }
    // LCP (スクショ) が済んでから 3D チャンクを取りに行く
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle
      ? window.requestIdleCallback(() => setShow3d(true), { timeout: 2500 })
      : window.setTimeout(() => setShow3d(true), 1500);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  // ヒーローがビューポート外の間は 3D を休止させる（スクロール後の電池/GPU 浪費防止）。
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !show3d) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show3d]);

  const faded = ready && !failed;

  return (
    <div ref={hostRef} className="relative">
      {/* ポスター: 実プロダクトのスクショ (LCP)。フェード後も a11y ツリーに残し、
          視覚だけ透明化・操作だけ無効化する（スクリーンリーダーの説明を失わない）。 */}
      <div
        className="transition-opacity duration-700"
        style={{ opacity: faded ? 0 : 1, pointerEvents: faded ? "none" : "auto" }}
      >
        {children}
      </div>
      {show3d && !failed && (
        <WebglErrorBoundary onError={() => setFailed(true)}>
          <CertificateScene
            active={inView}
            onReady={() => setReady(true)}
            className={`absolute inset-0 transition-opacity duration-700 ${
              faded ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
        </WebglErrorBoundary>
      )}
    </div>
  );
}
