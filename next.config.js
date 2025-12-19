/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.dotgg.gg',
        pathname: '/riftbound/cards/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/game/:matchId',
        destination: '/game?matchId=:matchId',
      },
    ];
  },
};

module.exports = nextConfig;
