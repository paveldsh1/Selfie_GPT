/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ['@tensorflow/tfjs-node']
  },
  webpack: (config, { dev, isServer }) => {
    // Enable source maps in development
    if (dev) {
      config.devtool = isServer ? 'eval-source-map' : 'cheap-module-source-map';
    }

    if (isServer) {
      // Ensure native module is not bundled
      config.externals = config.externals || [];
      config.externals.push('@tensorflow/tfjs-node');
    }
    
    return config;
  }
};

export default nextConfig;








