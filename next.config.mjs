/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Claude Code can send 100KB+ system prompts with tool definitions
  serverExternalPackages: [],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },

  // Anthropic API compatible paths for Claude Code
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
