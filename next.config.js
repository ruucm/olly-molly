/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  devIndicators: false,
  output: "standalone",
  
  // Exclude db folder from webpack file watching to prevent SQLite locking issues on Windows
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/db/**',           // SQLite database files
          '**/*.sqlite',
          '**/*.sqlite-wal',
          '**/*.sqlite-shm',
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
