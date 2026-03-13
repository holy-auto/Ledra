import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Next 16.1.6: Server Actions config is under experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  turbopack: {
    root: resolve("."),
  },
};

export default nextConfig;