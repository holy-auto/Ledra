"use client";

import { Component, type ReactNode } from "react";

/**
 * 装飾用 3D はどんな理由（WebGL コンテキスト生成失敗、GPU プロセスリセット、
 * ドライバのクラッシュ）で throw しても、動いているポスター付きページ全体を
 * 巻き添えにしてはならない。ここで捕捉して onError に委ね、fallback（= 何も
 * 描かない）に切り替える。近傍の Next.js エラー境界まで伝播させない。
 */
export class WebglErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
