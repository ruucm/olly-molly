import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["dist/**"],
  },
};

export default nextConfig;
