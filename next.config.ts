import type { NextConfig } from "next";

// Payouts and Ads & Boost are switched off for every merchant for now.
// Remove an entry here (and restore its sidebar link) to bring the page back.
const DISABLED_MERCHANT_PAGES = [
  { source: "/restaurant/payouts", destination: "/restaurant/dashboard" },
  { source: "/restaurant/add-request", destination: "/restaurant/dashboard" },
  { source: "/store-partner/payouts", destination: "/store-partner/dashboard" },
  { source: "/store-partner/add-request", destination: "/store-partner/dashboard" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return DISABLED_MERCHANT_PAGES.flatMap(({ source, destination }) => [
      { source, destination, permanent: false },
      { source: `${source}/:path*`, destination, permanent: false },
    ]);
  },
};

export default nextConfig;
