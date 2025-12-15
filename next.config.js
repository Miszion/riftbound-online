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
};

module.exports = nextConfig;
