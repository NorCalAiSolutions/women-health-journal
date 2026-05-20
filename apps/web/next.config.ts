import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@whjc/shared"],
  output: "standalone"
};

export default nextConfig;
