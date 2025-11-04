/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/secureproxyy.php', destination: '/api/secureproxy' },
      { source: '/secureproxyy.php/:path*', destination: '/api/secureproxy/:path*' }
    ];
  },
};

module.exports = nextConfig;
