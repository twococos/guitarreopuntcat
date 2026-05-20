/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "puppeteer"],
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ["src"],
  },
}

export default nextConfig
