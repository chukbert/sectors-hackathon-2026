/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone: server Next siap jalan + node_modules minimal, supaya image bisa dirakit tanpa npm install/build di VPS.
  output: "standalone",
  transpilePackages: ["echarts", "zrender", "echarts-for-react"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [];
  },
};

export default nextConfig;