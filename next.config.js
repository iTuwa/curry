/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/secureproxy.php', destination: '/api/secureproxy' },
      { source: '/secureproxy.php/:path*', destination: '/api/secureproxy/:path*' }
    ];
  },
};

module.exports = nextConfig;
