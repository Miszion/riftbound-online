/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.dotgg.gg',
        pathname: '/riftbound/cards/**',
      },
    ],
  },
  output: 'export',
}

module.exports = nextConfig
