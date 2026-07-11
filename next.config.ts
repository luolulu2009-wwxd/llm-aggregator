import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: import.meta.dirname,
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma", "pg", "ioredis"],
};

export default nextConfig;
