import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://*.supabase.co https://accounts.google.com",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), browsing-topics=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/:path*",
      },
    ];
  },
  poweredByHeader: false,
  serverExternalPackages: ["read-excel-file", "unzipper", "write-excel-file"],
};

export default nextConfig;
