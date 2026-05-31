import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dictionary fetch in the cron route pulls a large JSON; allow it.
  serverExternalPackages: [],
};

export default nextConfig;
