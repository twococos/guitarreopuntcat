/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "puppeteer", "@maxmind/geoip2-node"],
  experimental: {
    nodeMiddleware: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ["src"],
  },
  // Compatibilitat amb les URLs antigues (abans del refactor de la portada
  // pública). Les rutes de l'app han migrat de / a /app/. Aquestes
  // redireccions permanents eviten trencar enllaços externs o marcadors.
  async redirects() {
    return [
      { source: "/editor", destination: "/app/editor", permanent: true },
      { source: "/editor/:path*", destination: "/app/editor/:path*", permanent: true },
      { source: "/library", destination: "/app/library", permanent: true },
      { source: "/library/:path*", destination: "/app/library/:path*", permanent: true },
      { source: "/admin", destination: "/app/admin", permanent: true },
      { source: "/admin/:path*", destination: "/app/admin/:path*", permanent: true },
    ]
  },
}

export default nextConfig
