/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["echarts", "zrender", "echarts-for-react"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [];
  },
};

export default nextConfig;