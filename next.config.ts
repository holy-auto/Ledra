import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Next 16.1.6: Server Actions config is under experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // Turbopack root: point to the parent repo so Turbopack finds node_modules/next.
  // The worktree lives inside this directory so source files remain compilable.
  turbopack: {
    root: path.resolve(__dirname, "../../../.."),
  },
};

export default nextConfig;
