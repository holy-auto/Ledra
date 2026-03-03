import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Next 16.1.6: Server Actions config is under experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
;(() => {
  try {
    // Ensure Turbopack uses this project as the workspace root
    // @ts-ignore
    const cfg = module.exports?.default ?? module.exports;
    if (cfg) {
      cfg.turbopack = cfg.turbopack || {};
      cfg.turbopack.root = __dirname;
    }
  } catch {}
})();