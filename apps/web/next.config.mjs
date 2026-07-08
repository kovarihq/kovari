import { withSentryConfig } from "@sentry/nextjs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" && process.env.KEEP_CONSOLE !== "true",
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on'
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      },
      {
        key: 'X-Frame-Options',
        value: 'SAMEORIGIN'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()'
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.kovari.in https://*.clerk.accounts.dev https://va.vercel-scripts.com",
          "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
          "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co https://utfs.io https://randomuser.me https://*.onrender.com https://img.clerk.com https://*.clerk.com",
          "media-src 'self' data: blob: https://res.cloudinary.com https://*.onrender.com",
          "font-src 'self' https://api.fontshare.com",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.clerk.dev wss://kovari.in https://socket.kovari.in wss://socket.kovari.in http://localhost:3005 ws://localhost:3005 https://vitals.vercel-insights.com https://api.cloudinary.com https://*.onrender.com wss://*.onrender.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Private app surfaces
      {
        source: '/(dashboard|chat|create-group|groups|invite|notifications|onboarding|profile|requests|safety|settings|explore)/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      // Auth and account flows
      {
        source: '/(sign-in|sign-up|forgot-password|verify-email|sso-callback|banned)/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      // API routes
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/apiauth/:path*",
        destination: "/api/auth/:path*",
      },
    ];
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@heroui/react", "@heroui/theme"],
  webpack: (config, { isServer }) => {
    // Fix broken internal requires in sib-api-v3-sdk (expects bare 'ApiClient', 'model', 'api')
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ApiClient: path.resolve(
        __dirname,
        "../../node_modules/sib-api-v3-sdk/src/ApiClient"
      ),
      model: path.resolve(__dirname, "../../node_modules/sib-api-v3-sdk/src/model"),
      api: path.resolve(__dirname, "../../node_modules/sib-api-v3-sdk/src/api"),
    };

    // Exclude sib-api-v3-sdk from client bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
      // Mark sib-api-v3-sdk as external for client bundle
      const originalExternals = config.externals || [];
      config.externals = [
        ...(Array.isArray(originalExternals)
          ? originalExternals
          : [originalExternals]),
        ({ request }, callback) => {
          if (
            request === "sib-api-v3-sdk" ||
            request?.startsWith("sib-api-v3-sdk/")
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroui/react',
      'framer-motion',
      'date-fns',
      '@sentry/nextjs',
    ],
  },
  serverExternalPackages: ["bad-words"],
  // Add webpack optimization settings
  // webpack: (config, { dev, isServer }) => {
  //   // Optimize cache settings: always use memory cache for compatibility
  //   config.cache = { type: "memory" };

  //   // Handle Supabase realtime-js dependency
  //   config.resolve.fallback = {
  //     ...config.resolve.fallback,
  //     ws: false,
  //     net: false,
  //     tls: false,
  //     fs: false,
  //     dns: false,
  //     child_process: false,
  //   };

  //   // Optimize chunk size and string handling
  //   config.optimization = {
  //     ...config.optimization,
  //     splitChunks: {
  //       chunks: "all",
  //       minSize: 20000,
  //       maxSize: 244000,
  //       minChunks: 1,
  //       maxAsyncRequests: 30,
  //       maxInitialRequests: 30,
  //       cacheGroups: {
  //         defaultVendors: {
  //           test: /[\\/]node_modules[\\/]/,
  //           priority: -10,
  //           reuseExistingChunk: true,
  //         },
  //         default: {
  //           minChunks: 2,
  //           priority: -20,
  //           reuseExistingChunk: true,
  //         },
  //       },
  //     },
  //   };

  //   // Only add minimizer in production
  //   if (!dev) {
  //     config.optimization.minimize = true;
  //     config.optimization.minimizer = ["..."];
  //   }

  //   // Add performance hints only in production
  //   if (!dev) {
  //     config.performance = {
  //       hints: "warning",
  //       maxEntrypointSize: 512000,
  //       maxAssetSize: 512000,
  //     };
  //   }

  //   return config;
  // },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "kovari",
  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: false,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",
});
