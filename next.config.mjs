/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Claude Code sends 10MB+ bodies (MCP tool definitions + large system prompts)
  maxBodySize: "50mb",

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
