"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { isHeroWebglCapable, readHeroWebglEnv } from "@/lib/marketing/heroWebglGate";

/**
 * Hero 右カラムの 3D 演出ゲート。
 *
 * - children（実プロダクトのスクショ）は常に SSR され、LCP を担う。
 * - 対応デバイス（heroWebglGate）でのみ、アイドル時に 3D チャンクを遅延ロードし、
 *   スクショの上にクロスフェードで重ねる。
 * - 非対応・低速・reduced-motion・モバイルでは何もしない（スクショのまま）。
 *   3D は演出であり、決して LCP/INP を犠牲にしない — 提案書 P3 の方針どおり。
 */

const CertificateScene = dynamic(() => import("./CertificateScene"), { ssr: false });

export function Hero3DCertificate({ children }: { children: ReactNode }) {
  const [show3d, setShow3d] = useState(false);
  const [faded, setFaded] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHeroWebglCapable(readHeroWebglEnv())) return;
    // WebGL コンテキストが実際に作れない環境（無効化・仮想環境等）ではポスターのまま
    try {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return;
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

  // Canvas がマウントされ最初の描画が済むころ (次フレーム) にフェード開始
  useEffect(() => {
    if (!show3d) return;
    const t = window.setTimeout(() => setFaded(true), 350);
    return () => window.clearTimeout(t);
  }, [show3d]);

  return (
    <div ref={hostRef} className="relative">
      {/* ポスター: 実プロダクトのスクショ (LCP)。3D 表示後は淡く残して奥行きに */}
      <div
        className="transition-opacity duration-700"
        style={{ opacity: faded ? 0 : 1 }}
        aria-hidden={faded || undefined}
      >
        {children}
      </div>
      {show3d && (
        <CertificateScene
          className={`absolute inset-0 transition-opacity duration-700 ${faded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
